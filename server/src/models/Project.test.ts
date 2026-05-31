import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Project } from './Project.js';
import {
  createTestProject,
  createMockUserId,
  createSampleNode,
  createSampleEdge,
} from '../test/helpers.js';
import { setupMongoTestDB } from '../test/setup.js';

setupMongoTestDB();

describe('Project Model', () => {

  describe('validation', () => {
    it('should require userId', async () => {
      const project = new Project({
        name: 'Test Project',
      });

      await expect(project.save()).rejects.toThrow('User ID is required');
    });

    it('should default name to "Untitled Project"', async () => {
      const userId = createMockUserId();
      const project = new Project({ userId });

      await project.save();

      expect(project.name).toBe('Untitled Project');
    });

    it('should trim whitespace from name', async () => {
      const userId = createMockUserId();
      const project = new Project({
        userId,
        name: '  My Project  ',
      });

      await project.save();

      expect(project.name).toBe('My Project');
    });

    it('should enforce max length on name', async () => {
      const userId = createMockUserId();
      const longName = 'a'.repeat(201);
      const project = new Project({
        userId,
        name: longName,
      });

      await expect(project.save()).rejects.toThrow(
        'Project name cannot exceed 200 characters'
      );
    });

    it('should default nodes to empty object', async () => {
      const userId = createMockUserId();
      const project = new Project({ userId });

      await project.save();

      expect(project.nodes).toEqual({});
    });

    it('should default edges to empty object', async () => {
      const userId = createMockUserId();
      const project = new Project({ userId });

      await project.save();

      expect(project.edges).toEqual({});
    });

    it('should default patches to empty object', async () => {
      const userId = createMockUserId();
      const project = new Project({ userId });

      await project.save();

      expect(project.patches).toEqual({});
    });

    it('should default deletedAt to null', async () => {
      const userId = createMockUserId();
      const project = new Project({ userId });

      await project.save();

      expect(project.deletedAt).toBeNull();
    });

    it('should store complex node structures', async () => {
      const userId = createMockUserId();
      const nodes = {
        node1: createSampleNode('node1', 'source_table'),
        node2: createSampleNode('node2', 'derived_table'),
      };

      const project = new Project({
        userId,
        nodes,
      });

      await project.save();

      expect(project.nodes).toEqual(nodes);
    });

    it('should store edge structures', async () => {
      const userId = createMockUserId();
      const edges = {
        edge1: createSampleEdge('edge1', 'node1', 'node2'),
      };

      const project = new Project({
        userId,
        edges,
      });

      await project.save();

      expect(project.edges).toEqual(edges);
    });
  });


  describe('soft delete', () => {
    it('should set deletedAt on softDelete()', async () => {
      const project = await createTestProject();
      expect(project.deletedAt).toBeNull();

      await project.softDelete();

      expect(project.deletedAt).toBeInstanceOf(Date);
      expect(project.isDeleted()).toBe(true);
    });

    it('should clear deletedAt on restore()', async () => {
      const project = await createTestProject({ deleted: true });
      expect(project.deletedAt).toBeInstanceOf(Date);

      await project.restore();

      expect(project.deletedAt).toBeNull();
      expect(project.isDeleted()).toBe(false);
    });

    it('should return true for isDeleted() when deleted', async () => {
      const project = await createTestProject({ deleted: true });

      expect(project.isDeleted()).toBe(true);
    });

    it('should return false for isDeleted() when not deleted', async () => {
      const project = await createTestProject();

      expect(project.isDeleted()).toBe(false);
    });

    it('should exclude deleted projects from findByUser()', async () => {
      const userId = createMockUserId();

      await createTestProject({ userId, name: 'Active 1' });
      await createTestProject({ userId, name: 'Active 2' });
      await createTestProject({ userId, name: 'Active 3' });
      await createTestProject({ userId, name: 'Deleted 1', deleted: true });
      await createTestProject({ userId, name: 'Deleted 2', deleted: true });

      const projects = await Project.findByUser(userId);

      expect(projects).toHaveLength(3);
      expect(projects.every((p) => !p.deletedAt)).toBe(true);
    });

    it('should exclude deleted projects from findByIdAndUser()', async () => {
      const userId = createMockUserId();
      const project = await createTestProject({ userId, deleted: true });

      const found = await Project.findByIdAndUser(
        project._id.toString(),
        userId.toString()
      );

      expect(found).toBeNull();
    });
  });


  describe('findByUser', () => {
    it('should return projects for a specific user', async () => {
      const userId1 = createMockUserId();
      const userId2 = createMockUserId();

      await createTestProject({ userId: userId1, name: 'User1 Project 1' });
      await createTestProject({ userId: userId1, name: 'User1 Project 2' });
      await createTestProject({ userId: userId2, name: 'User2 Project 1' });

      const user1Projects = await Project.findByUser(userId1);
      const user2Projects = await Project.findByUser(userId2);

      expect(user1Projects).toHaveLength(2);
      expect(user2Projects).toHaveLength(1);
    });

    it('should sort by updatedAt descending', async () => {
      const userId = createMockUserId();

      const project1 = await createTestProject({ userId, name: 'First' });
      const project2 = await createTestProject({ userId, name: 'Second' });
      const project3 = await createTestProject({ userId, name: 'Third' });

      // Update project1 to make it most recent
      project1.name = 'First Updated';
      await project1.save();

      const projects = await Project.findByUser(userId);

      expect(projects[0].name).toBe('First Updated');
    });

    it('should only return selected fields', async () => {
      const userId = createMockUserId();
      await createTestProject({
        userId,
        nodes: { node1: createSampleNode('node1') },
      });

      const projects = await Project.findByUser(userId);

      expect(projects[0]._id).toBeDefined();
      expect(projects[0].name).toBeDefined();
      expect(projects[0].updatedAt).toBeDefined();
      expect(projects[0].createdAt).toBeDefined();
    });

    it('should return empty array for user with no projects', async () => {
      const userId = createMockUserId();

      const projects = await Project.findByUser(userId);

      expect(projects).toHaveLength(0);
    });
  });

  describe('findByIdAndUser', () => {
    it('should find project by id and user', async () => {
      const userId = createMockUserId();
      const project = await createTestProject({ userId, name: 'My Project' });

      const found = await Project.findByIdAndUser(
        project._id.toString(),
        userId.toString()
      );

      expect(found).not.toBeNull();
      expect(found!.name).toBe('My Project');
    });

    it('should return null for wrong user', async () => {
      const userId1 = createMockUserId();
      const userId2 = createMockUserId();
      const project = await createTestProject({ userId: userId1 });

      const found = await Project.findByIdAndUser(
        project._id.toString(),
        userId2.toString()
      );

      expect(found).toBeNull();
    });

    it('should return null for non-existent project', async () => {
      const userId = createMockUserId();
      const fakeId = new Types.ObjectId();

      const found = await Project.findByIdAndUser(
        fakeId.toString(),
        userId.toString()
      );

      expect(found).toBeNull();
    });
  });

  describe('findWithDeleted', () => {
    it('should include deleted projects', async () => {
      const userId = createMockUserId();

      await createTestProject({ userId, name: 'Active' });
      await createTestProject({ userId, name: 'Deleted', deleted: true });

      const all = await Project.findWithDeleted({ userId });

      expect(all).toHaveLength(2);
    });
  });

  describe('findByUserWithDeleted', () => {
    it('should include deleted projects for user', async () => {
      const userId = createMockUserId();

      await createTestProject({ userId, name: 'Active' });
      await createTestProject({ userId, name: 'Deleted', deleted: true });

      const projects = await Project.findByUserWithDeleted(userId);

      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.deletedAt !== null)).toBe(true);
    });
  });


  describe('toPublic', () => {
    it('should return public representation', async () => {
      const userId = createMockUserId();
      const project = await createTestProject({
        userId,
        name: 'My Project',
        nodes: { node1: createSampleNode('node1') },
      });

      const publicData = project.toPublic();

      expect(publicData.id).toBe(project._id.toString());
      expect(publicData.name).toBe('My Project');
      expect(publicData.nodes).toEqual(project.nodes);
      expect(publicData.edges).toEqual({});
      expect(publicData.patches).toEqual({});
      expect(publicData.createdAt).toBeInstanceOf(Date);
      expect(publicData.updatedAt).toBeInstanceOf(Date);
    });

    it('should not include userId or deletedAt in public data', async () => {
      const userId = createMockUserId();
      const project = await createTestProject({ userId });

      const publicData = project.toPublic();

      expect((publicData as Record<string, unknown>).userId).toBeUndefined();
      expect((publicData as Record<string, unknown>).deletedAt).toBeUndefined();
    });
  });


  describe('timestamps', () => {
    it('should set createdAt on creation', async () => {
      const project = await createTestProject();

      expect(project.createdAt).toBeInstanceOf(Date);
    });

    it('should set updatedAt on creation', async () => {
      const project = await createTestProject();

      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on save', async () => {
      const project = await createTestProject();
      const originalUpdatedAt = project.updatedAt;

      await new Promise((r) => setTimeout(r, 10));

      project.name = 'Updated Name';
      await project.save();

      expect(project.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );
    });
  });
});
