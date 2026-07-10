import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { LIMITS } from '../config/limits.js'
import { User } from '../models/User.js'
import {
  createSampleNode,
  createTestProject,
  createTestProjects,
} from '../test/helpers.js'
import { setupMongoTestDB } from '../test/setup.js'
import { getProjectRoutesTestContext } from './projectRoutesTestSupport.js'

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
  it('should reject when user has reached the google-tier project limit', async () => {
    const { app, mockUser } = getProjectRoutesTestContext()
    const userId = new Types.ObjectId(mockUser.userId)
    await createGoogleUser(userId, mockUser.email)
    await createTestProjects(userId, LIMITS.google.maxProjects)
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'One Too Many' })
      .expect(403)
    expect(response.body.success).toBe(false)
    expect(response.body.error).toContain('limit')
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

  it('should handle large nodes object', async () => {
    const { app } = getProjectRoutesTestContext()
    const nodes: Record<string, unknown> = {}
    for (let index = 0; index < 100; index++) {
      nodes[`node${index}`] = createSampleNode(`node${index}`)
    }
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'Large Project', nodes })
      .expect(201)
    expect(Object.keys(response.body.data.project.nodes)).toHaveLength(100)
  })
})
