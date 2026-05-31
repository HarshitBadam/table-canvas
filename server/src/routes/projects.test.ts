import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createTestApp, createDefaultMockUser, createSecondMockUser, MockUser } from '../test/testApp.js';
import { Project } from '../models/Project.js';
import {
  createTestProject,
  createSampleNode,
  createSampleEdge,
} from '../test/helpers.js';
import { setupMongoTestDB } from '../test/setup.js';

setupMongoTestDB();

describe('Projects API', () => {
  let mockUser: MockUser;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    mockUser = createDefaultMockUser();
    app = createTestApp(mockUser);
  });


  describe('POST /api/projects', () => {
    it('should create project with valid data', async () => {
      const projectData = {
        name: 'My New Project',
        nodes: {
          node1: createSampleNode('node1'),
        },
        edges: {},
        patches: {},
      };

      const response = await request(app)
        .post('/api/projects')
        .send(projectData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.project).toBeDefined();
      expect(response.body.data.project.name).toBe('My New Project');
      expect(response.body.data.project.id).toBeDefined();
    });

    it('should use default name if not provided', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.project.name).toBe('Untitled Project');
    });

    it('should initialize empty nodes/edges/patches', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Empty Project' })
        .expect(201);

      expect(response.body.data.project.nodes).toEqual({});
      expect(response.body.data.project.edges).toEqual({});
      expect(response.body.data.project.patches).toEqual({});
    });

    it('should set timestamps', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Timestamped Project' })
        .expect(201);

      expect(response.body.data.project.createdAt).toBeDefined();
      expect(response.body.data.project.updatedAt).toBeDefined();
    });

    it('should store complex node structures', async () => {
      const nodes = {
        source1: createSampleNode('source1', 'source_table'),
        derived1: createSampleNode('derived1', 'derived_table'),
        chart1: createSampleNode('chart1', 'chart'),
      };

      const edges = {
        edge1: createSampleEdge('edge1', 'source1', 'derived1'),
      };

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Complex Project', nodes, edges })
        .expect(201);

      expect(response.body.data.project.nodes.source1).toBeDefined();
      expect(response.body.data.project.nodes.derived1).toBeDefined();
      expect(response.body.data.project.edges.edge1).toBeDefined();
    });
  });


  describe('GET /api/projects', () => {
    it('should return user projects sorted by updatedAt', async () => {
      const userId = new Types.ObjectId(mockUser.userId);

      const p1 = await createTestProject({ userId, name: 'Project 1' });
      await new Promise((r) => setTimeout(r, 10));
      const p2 = await createTestProject({ userId, name: 'Project 2' });
      await new Promise((r) => setTimeout(r, 10));
      const p3 = await createTestProject({ userId, name: 'Project 3' });

      p1.name = 'Project 1 Updated';
      await p1.save();

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.projects).toHaveLength(3);
      expect(response.body.data.projects[0].name).toBe('Project 1 Updated');
    });

    it('should not return deleted projects', async () => {
      const userId = new Types.ObjectId(mockUser.userId);

      await createTestProject({ userId, name: 'Active Project' });
      await createTestProject({ userId, name: 'Deleted Project', deleted: true });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.data.projects).toHaveLength(1);
      expect(response.body.data.projects[0].name).toBe('Active Project');
    });

    it('should not return other users projects', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const otherUserId = new Types.ObjectId();

      await createTestProject({ userId, name: 'My Project' });
      await createTestProject({ userId: otherUserId, name: 'Other User Project' });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.data.projects).toHaveLength(1);
      expect(response.body.data.projects[0].name).toBe('My Project');
    });

    it('should return empty array for user with no projects', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.data.projects).toHaveLength(0);
    });

    it('should include id, name, updatedAt, createdAt fields', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      await createTestProject({ userId, name: 'Test Project' });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const project = response.body.data.projects[0];
      expect(project.id).toBeDefined();
      expect(project.name).toBeDefined();
      expect(project.updatedAt).toBeDefined();
      expect(project.createdAt).toBeDefined();
    });
  });


  describe('GET /api/projects/:id', () => {
    it('should return project with all fields', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const nodes = { node1: createSampleNode('node1') };
      const edges = { edge1: createSampleEdge('edge1', 'node1', 'node2') };

      const project = await createTestProject({
        userId,
        name: 'Full Project',
        nodes,
        edges,
      });

      const response = await request(app)
        .get(`/api/projects/${project._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.project.id).toBe(project._id.toString());
      expect(response.body.data.project.name).toBe('Full Project');
      const returnedNode = response.body.data.project.nodes.node1;
      expect(returnedNode.id).toBe('node1');
      expect(returnedNode.kind).toBe('source_table');
      expect(returnedNode.name).toBe('Node node1');
      expect(response.body.data.project.edges).toEqual(edges);
      expect(response.body.data.project.patches).toEqual({});
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = new Types.ObjectId();

      const response = await request(app)
        .get(`/api/projects/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 for invalid ObjectId', async () => {
      const response = await request(app)
        .get('/api/projects/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for other users project', async () => {
      const otherUserId = new Types.ObjectId();
      const project = await createTestProject({
        userId: otherUserId,
        name: 'Other Project',
      });

      const response = await request(app)
        .get(`/api/projects/${project._id}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for deleted project', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const project = await createTestProject({
        userId,
        name: 'Deleted Project',
        deleted: true,
      });

      const response = await request(app)
        .get(`/api/projects/${project._id}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });


  describe('PUT /api/projects/:id', () => {
    it('should update all fields', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const project = await createTestProject({ userId, name: 'Original' });

      const newNodes = { newNode: createSampleNode('newNode') };
      const newEdges = { newEdge: createSampleEdge('newEdge', 'a', 'b') };

      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({
          name: 'Updated Name',
          nodes: newNodes,
          edges: newEdges,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.project.name).toBe('Updated Name');
      expect(response.body.data.project.nodes).toEqual(newNodes);
      expect(response.body.data.project.edges).toEqual(newEdges);
    });

    it('should only update provided fields', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const originalNodes = { node1: createSampleNode('node1') };
      const project = await createTestProject({
        userId,
        name: 'Original',
        nodes: originalNodes,
      });

      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(response.body.data.project.name).toBe('New Name');
      // Nodes should remain unchanged (verify key fields survive round-trip)
      const returnedNode = response.body.data.project.nodes.node1;
      expect(returnedNode.id).toBe('node1');
      expect(returnedNode.kind).toBe('source_table');
    });

    it('should update timestamp', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const project = await createTestProject({ userId });
      const originalUpdatedAt = project.updatedAt;

      await new Promise((r) => setTimeout(r, 10));

      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'Updated' })
        .expect(200);

      const newUpdatedAt = new Date(response.body.data.project.updatedAt);
      expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = new Types.ObjectId();

      const response = await request(app)
        .put(`/api/projects/${fakeId}`)
        .send({ name: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for other users project', async () => {
      const otherUserId = new Types.ObjectId();
      const project = await createTestProject({ userId: otherUserId });

      const response = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'Hijacked' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });


  describe('PATCH /api/projects/:id', () => {
    it('should partially update project', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const project = await createTestProject({
        userId,
        name: 'Original',
        nodes: { node1: createSampleNode('node1') },
      });

      const response = await request(app)
        .patch(`/api/projects/${project._id}`)
        .send({ name: 'Patched Name' })
        .expect(200);

      expect(response.body.data.project.name).toBe('Patched Name');
      expect(response.body.data.project.nodes.node1).toBeDefined();
    });

    it('should only update allowed fields', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const project = await createTestProject({ userId });

      // Try to update userId (should be ignored)
      const response = await request(app)
        .patch(`/api/projects/${project._id}`)
        .send({
          name: 'Valid Update',
          userId: new Types.ObjectId().toString(),
        })
        .expect(200);

      expect(response.body.data.project.name).toBe('Valid Update');
    });
  });


  describe('DELETE /api/projects/:id', () => {
    it('should soft-delete project', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const project = await createTestProject({ userId, name: 'To Delete' });

      const response = await request(app)
        .delete(`/api/projects/${project._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');

      // Verify project is soft-deleted (still exists but has deletedAt set)
      const found = await Project.findById(project._id);
      expect(found).not.toBeNull();
      expect(found!.deletedAt).not.toBeNull();
    });

    it('should return 404 for non-existent project', async () => {
      const fakeId = new Types.ObjectId();

      const response = await request(app)
        .delete(`/api/projects/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for other users project', async () => {
      const otherUserId = new Types.ObjectId();
      const project = await createTestProject({ userId: otherUserId });

      const response = await request(app)
        .delete(`/api/projects/${project._id}`)
        .expect(404);

      expect(response.body.success).toBe(false);

      const found = await Project.findById(project._id);
      expect(found).not.toBeNull();
    });

    it('should return 404 for already deleted project', async () => {
      const userId = new Types.ObjectId(mockUser.userId);
      const project = await createTestProject({
        userId,
        name: 'Already Deleted',
        deleted: true,
      });

      const response = await request(app)
        .delete(`/api/projects/${project._id}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });


  describe('edge cases', () => {
    it('should handle very long project names at limit', async () => {
      const longName = 'a'.repeat(200);

      const response = await request(app)
        .post('/api/projects')
        .send({ name: longName })
        .expect(201);

      expect(response.body.data.project.name).toBe(longName);
    });

    it('should handle empty string name', async () => {
      // Empty string is falsy, so API defaults to "Untitled Project"
      const response = await request(app)
        .post('/api/projects')
        .send({ name: '' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.project.name).toBe('Untitled Project');
    });

    it('should handle special characters in name', async () => {
      const specialName = 'Project <script>alert("xss")</script>';

      const response = await request(app)
        .post('/api/projects')
        .send({ name: specialName })
        .expect(201);

      // Name is stored as-is (sanitization happens at render time)
      expect(response.body.data.project.name).toBe(specialName);
    });

    it('should handle large nodes object', async () => {
      const nodes: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        nodes[`node${i}`] = createSampleNode(`node${i}`);
      }

      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'Large Project', nodes })
        .expect(201);

      expect(Object.keys(response.body.data.project.nodes)).toHaveLength(100);
    });
  });
});
