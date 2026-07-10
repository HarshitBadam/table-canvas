import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import { Project } from '../models/Project.js'
import {
  createSampleEdge,
  createSampleNode,
  createTestProject,
} from '../test/helpers.js'
import { setupMongoTestDB } from '../test/setup.js'
import { getProjectRoutesTestContext } from './projectRoutesTestSupport.js'

setupMongoTestDB()

describe('Projects API update and delete', () => {
  describe('PUT /api/projects/:id', () => {
    it('should update all fields', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'Original',
      })
      const nodes = { newNode: createSampleNode('newNode') }
      const edges = { newEdge: createSampleEdge('newEdge', 'a', 'b') }
      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'Updated Name', nodes, edges })
        .expect(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.project.name).toBe('Updated Name')
      expect(response.body.data.project.nodes).toEqual(nodes)
      expect(response.body.data.project.edges).toEqual(edges)
    })

    it('should only update provided fields', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'Original',
        nodes: { node1: createSampleNode('node1') },
      })
      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'New Name' })
        .expect(200)
      expect(response.body.data.project.name).toBe('New Name')
      const node = response.body.data.project.nodes.node1
      expect(node.id).toBe('node1')
      expect(node.kind).toBe('source_table')
    })

    it('should update timestamp', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
      })
      const originalUpdatedAt = project.updatedAt
      await new Promise(resolve => setTimeout(resolve, 10))
      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'Updated' })
        .expect(200)
      expect(new Date(response.body.data.project.updatedAt).getTime())
        .toBeGreaterThan(originalUpdatedAt.getTime())
    })

    it('should return 404 for non-existent project', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app)
        .put(`/api/projects/${new Types.ObjectId()}`)
        .send({ name: 'Updated' })
        .expect(404)
      expect(response.body.success).toBe(false)
    })

    it('should return 404 for other users project', async () => {
      const { app } = getProjectRoutesTestContext()
      const project = await createTestProject({ userId: new Types.ObjectId() })
      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'Hijacked' })
        .expect(404)
      expect(response.body.success).toBe(false)
    })
  })

  describe('PATCH /api/projects/:id', () => {
    it('should partially update project', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'Original',
        nodes: { node1: createSampleNode('node1') },
      })
      const response = await request(app)
        .patch(`/api/projects/${project._id}`)
        .send({ name: 'Patched Name' })
        .expect(200)
      expect(response.body.data.project.name).toBe('Patched Name')
      expect(response.body.data.project.nodes.node1).toBeDefined()
    })

    it('should only update allowed fields', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
      })
      const response = await request(app)
        .patch(`/api/projects/${project._id}`)
        .send({
          name: 'Valid Update',
          userId: new Types.ObjectId().toString(),
        })
        .expect(200)
      expect(response.body.data.project.name).toBe('Valid Update')
    })
  })

  describe('DELETE /api/projects/:id', () => {
    it('should soft-delete project', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'To Delete',
      })
      const response = await request(app)
        .delete(`/api/projects/${project._id}`)
        .expect(200)
      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain('deleted')
      const found = await Project.findById(project._id)
      expect(found).not.toBeNull()
      expect(found!.deletedAt).not.toBeNull()
    })

    it('should return 404 for non-existent project', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app)
        .delete(`/api/projects/${new Types.ObjectId()}`)
        .expect(404)
      expect(response.body.success).toBe(false)
    })

    it('should return 404 for other users project', async () => {
      const { app } = getProjectRoutesTestContext()
      const project = await createTestProject({ userId: new Types.ObjectId() })
      const response = await request(app)
        .delete(`/api/projects/${project._id}`)
        .expect(404)
      expect(response.body.success).toBe(false)
      expect(await Project.findById(project._id)).not.toBeNull()
    })

    it('should return 404 for already deleted project', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'Already Deleted',
        deleted: true,
      })
      const response = await request(app)
        .delete(`/api/projects/${project._id}`)
        .expect(404)
      expect(response.body.success).toBe(false)
    })
  })
})
