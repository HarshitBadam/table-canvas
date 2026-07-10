import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { Types } from 'mongoose'
import {
  createSampleEdge,
  createSampleNode,
  createTestProject,
} from '../test/helpers.js'
import { setupMongoTestDB } from '../test/setup.js'
import { getProjectRoutesTestContext } from './projectRoutesTestSupport.js'

setupMongoTestDB()

describe('Projects API create and read', () => {
  describe('POST /api/projects', () => {
    it('should create project with valid data', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'My New Project',
          nodes: { node1: createSampleNode('node1') },
          edges: {},
          patches: {},
        })
        .expect(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.project).toBeDefined()
      expect(response.body.data.project.name).toBe('My New Project')
      expect(response.body.data.project.id).toBeDefined()
    })

    it('should use default name if not provided', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app).post('/api/projects').send({}).expect(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.project.name).toBe('Untitled Project')
    })

    it('should initialize empty nodes/edges/patches', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Empty Project' })
        .expect(201)
      expect(response.body.data.project.nodes).toEqual({})
      expect(response.body.data.project.edges).toEqual({})
      expect(response.body.data.project.patches).toEqual({})
    })

    it('should set timestamps', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Timestamped Project' })
        .expect(201)
      expect(response.body.data.project.createdAt).toBeDefined()
      expect(response.body.data.project.updatedAt).toBeDefined()
    })

    it('should store complex node structures', async () => {
      const { app } = getProjectRoutesTestContext()
      const nodes = {
        source1: createSampleNode('source1', 'source_table'),
        derived1: createSampleNode('derived1', 'derived_table'),
        chart1: createSampleNode('chart1', 'chart'),
      }
      const edges = { edge1: createSampleEdge('edge1', 'source1', 'derived1') }
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Complex Project', nodes, edges })
        .expect(201)
      expect(response.body.data.project.nodes.source1).toBeDefined()
      expect(response.body.data.project.nodes.derived1).toBeDefined()
      expect(response.body.data.project.edges.edge1).toBeDefined()
    })
  })

  describe('GET /api/projects', () => {
    it('should return user projects sorted by updatedAt', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const userId = new Types.ObjectId(mockUser.userId)
      const first = await createTestProject({ userId, name: 'Project 1' })
      await new Promise(resolve => setTimeout(resolve, 10))
      await createTestProject({ userId, name: 'Project 2' })
      await new Promise(resolve => setTimeout(resolve, 10))
      await createTestProject({ userId, name: 'Project 3' })
      first.name = 'Project 1 Updated'
      await first.save()

      const response = await request(app).get('/api/projects').expect(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.projects).toHaveLength(3)
      expect(response.body.data.projects[0].name).toBe('Project 1 Updated')
    })

    it('should not return deleted projects', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const userId = new Types.ObjectId(mockUser.userId)
      await createTestProject({ userId, name: 'Active Project' })
      await createTestProject({ userId, name: 'Deleted Project', deleted: true })
      const response = await request(app).get('/api/projects').expect(200)
      expect(response.body.data.projects).toHaveLength(1)
      expect(response.body.data.projects[0].name).toBe('Active Project')
    })

    it('should not return other users projects', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'My Project',
      })
      await createTestProject({
        userId: new Types.ObjectId(),
        name: 'Other User Project',
      })
      const response = await request(app).get('/api/projects').expect(200)
      expect(response.body.data.projects).toHaveLength(1)
      expect(response.body.data.projects[0].name).toBe('My Project')
    })

    it('should return empty array for user with no projects', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app).get('/api/projects').expect(200)
      expect(response.body.data.projects).toHaveLength(0)
    })

    it('should include id, name, updatedAt, createdAt fields', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'Test Project',
      })
      const response = await request(app).get('/api/projects').expect(200)
      const project = response.body.data.projects[0]
      expect(project.id).toBeDefined()
      expect(project.name).toBeDefined()
      expect(project.updatedAt).toBeDefined()
      expect(project.createdAt).toBeDefined()
    })
  })

  describe('GET /api/projects/:id', () => {
    it('should return project with all fields', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const nodes = { node1: createSampleNode('node1') }
      const edges = { edge1: createSampleEdge('edge1', 'node1', 'node2') }
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'Full Project',
        nodes,
        edges,
      })
      const response = await request(app).get(`/api/projects/${project._id}`).expect(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.project.id).toBe(project._id.toString())
      expect(response.body.data.project.name).toBe('Full Project')
      const node = response.body.data.project.nodes.node1
      expect(node.id).toBe('node1')
      expect(node.kind).toBe('source_table')
      expect(node.name).toBe('Node node1')
      expect(response.body.data.project.edges).toEqual(edges)
      expect(response.body.data.project.patches).toEqual({})
    })

    it('should return 404 for non-existent project', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app)
        .get(`/api/projects/${new Types.ObjectId()}`)
        .expect(404)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('not found')
    })

    it('should return 400 for invalid ObjectId', async () => {
      const { app } = getProjectRoutesTestContext()
      const response = await request(app).get('/api/projects/invalid-id').expect(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toBeDefined()
    })

    it('should return 404 for other users project', async () => {
      const { app } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(),
        name: 'Other Project',
      })
      const response = await request(app).get(`/api/projects/${project._id}`).expect(404)
      expect(response.body.success).toBe(false)
    })

    it('should return 404 for deleted project', async () => {
      const { app, mockUser } = getProjectRoutesTestContext()
      const project = await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        name: 'Deleted Project',
        deleted: true,
      })
      const response = await request(app).get(`/api/projects/${project._id}`).expect(404)
      expect(response.body.success).toBe(false)
    })
  })
})
