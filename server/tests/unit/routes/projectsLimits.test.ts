import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { LIMITS } from '../../../src/config/limits.js'
import { User } from '../../../src/models/User.js'
import {
  createSampleNode,
  createTestProject,
  createTestProjects,
} from '../../support/helpers.js'
import { setupMongoTestDB } from '../../support/setup.js'
import { getProjectRoutesTestContext } from '../../support/projectRoutesTestSupport.js'
import { createProjectWithinCapacity } from '../../../src/services/projectCapacity.js'

setupMongoTestDB()

async function createGoogleUser(userId: Types.ObjectId, email: string): Promise<void> {
  await User.create({
    _id: userId,
    email,
    name: 'Test User',
    tier: 'google',
    passwordHash: 'hash',
  })
}

describe('Projects API limits', () => {
  it('allows Google users to create projects beyond the former limit', async () => {
    const { app, mockUser } = getProjectRoutesTestContext()
    const userId = new Types.ObjectId(mockUser.userId)
    await createGoogleUser(userId, mockUser.email)
    await createTestProjects(userId, LIMITS.google.maxProjects)
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'One Too Many' })
      .expect(201)
    expect(response.body.success).toBe(true)
  })

  it('should allow project creation when below the limit', async () => {
    const { app, mockUser } = getProjectRoutesTestContext()
    const userId = new Types.ObjectId(mockUser.userId)
    await createGoogleUser(userId, mockUser.email)
    await createTestProjects(userId, LIMITS.google.maxProjects - 1)
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'Under Limit' })
      .expect(201)
    expect(response.body.success).toBe(true)
  })

  it('should not count soft-deleted projects toward the limit', async () => {
    const { app, mockUser } = getProjectRoutesTestContext()
    const userId = new Types.ObjectId(mockUser.userId)
    await createGoogleUser(userId, mockUser.email)
    await createTestProjects(userId, LIMITS.google.maxProjects - 1)
    await createTestProject({ userId, name: 'Deleted', deleted: true })
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'After Deleted' })
      .expect(201)
    expect(response.body.success).toBe(true)
  })

  it('allows concurrent Google project creation beyond the former capacity', async () => {
    const { app, mockUser } = getProjectRoutesTestContext()
    const userId = new Types.ObjectId(mockUser.userId)
    await createGoogleUser(userId, mockUser.email)
    await createTestProjects(userId, LIMITS.google.maxProjects - 1)

    const responses = await Promise.all([
      request(app).post('/api/projects').send({ name: 'Concurrent A' }),
      request(app).post('/api/projects').send({ name: 'Concurrent B' }),
    ])

    expect(responses.map(response => response.status).sort()).toEqual([201, 201])
  })

  it('allows concurrent Google project creation at the persistence boundary', async () => {
    const { mockUser } = getProjectRoutesTestContext()
    const userId = new Types.ObjectId(mockUser.userId)
    await createGoogleUser(userId, mockUser.email)
    await createTestProjects(userId, LIMITS.google.maxProjects - 1)

    const results = await Promise.allSettled([
      createProjectWithinCapacity({
        userId: userId.toString(),
        tier: 'google',
        operationId: 'boundary-a',
        name: 'Boundary A',
      }),
      createProjectWithinCapacity({
        userId: userId.toString(),
        tier: 'google',
        operationId: 'boundary-b',
        name: 'Boundary B',
      }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(0)
  })

  it('reconciles retries with the same idempotency key', async () => {
    const { app } = getProjectRoutesTestContext()
    const first = await request(app)
      .post('/api/projects')
      .set('Idempotency-Key', 'same-create-operation')
      .send({ name: 'Idempotent' })
      .expect(201)
    const retry = await request(app)
      .post('/api/projects')
      .set('Idempotency-Key', 'same-create-operation')
      .send({ name: 'Idempotent' })
      .expect(201)

    expect(retry.body.data.project.id).toBe(first.body.data.project.id)
  })

  it('rejects reusing an idempotency key with different project data', async () => {
    const { app } = getProjectRoutesTestContext()
    await request(app)
      .post('/api/projects')
      .set('Idempotency-Key', 'drifted-create-operation')
      .send({ name: 'Original' })
      .expect(201)
    await request(app)
      .post('/api/projects')
      .set('Idempotency-Key', 'drifted-create-operation')
      .send({ name: 'Different' })
      .expect(409)
  })

  it('rejects restore routes because deletion is permanent', async () => {
    const { app, mockUser } = getProjectRoutesTestContext()
    const userId = new Types.ObjectId(mockUser.userId)
    await createGoogleUser(userId, mockUser.email)
    const project = await createTestProject({
      userId,
      name: 'Active project',
    })

    await request(app)
      .post(`/api/projects/${project._id.toString()}/restore`)
      .send({ expectedRevision: project.revision })
      .expect(404)
  })
})

describe('Projects API request rate limiting', () => {
  it('meters writes but leaves reads unmetered', async () => {
    const { app } = getProjectRoutesTestContext()

    const write = await request(app)
      .post('/api/projects')
      .send({ name: 'Metered' })
      .expect(201)
    const read = await request(app).get('/api/projects').expect(200)

    expect(write.headers['ratelimit-policy']).toBeDefined()
    expect(read.headers['ratelimit-policy']).toBeUndefined()
  })
})

describe('Projects API edge cases', () => {
  it('should handle very long project names at limit', async () => {
    const { app } = getProjectRoutesTestContext()
    const name = 'a'.repeat(200)
    const response = await request(app)
      .post('/api/projects')
      .send({ name })
      .expect(201)
    expect(response.body.data.project.name).toBe(name)
  })

  it('should handle empty string name', async () => {
    const { app } = getProjectRoutesTestContext()
    const response = await request(app)
      .post('/api/projects')
      .send({ name: '' })
      .expect(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data.project.name).toBe('Untitled Project')
  })

  it('should handle special characters in name', async () => {
    const { app } = getProjectRoutesTestContext()
    const name = 'Project <script>alert("xss")</script>'
    const response = await request(app)
      .post('/api/projects')
      .send({ name })
      .expect(201)
    // Project names remain raw in storage and must be escaped at render boundaries.
    expect(response.body.data.project.name).toBe(name)
  })

  it('allows Google projects with more tables than the former limit', async () => {
    const { app } = getProjectRoutesTestContext()
    const nodes: Record<string, unknown> = {}
    for (let index = 0; index <= LIMITS.google.maxTablesPerProject; index++) {
      nodes[`node${index}`] = createSampleNode(`node${index}`)
    }
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'Large Project', nodes })
      .expect(201)
    expect(response.body.success).toBe(true)
  })

  it('allows Google projects with tables beyond the former row limit', async () => {
    const { app } = getProjectRoutesTestContext()
    const nodes = {
      oversized: {
        ...createSampleNode('oversized'),
        schema: {
          columns: [],
          rowCount: LIMITS.google.maxRowsPerTable + 1,
        },
      },
    }
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'Oversized Project', nodes })
      .expect(201)
    expect(response.body.success).toBe(true)
  })
})
