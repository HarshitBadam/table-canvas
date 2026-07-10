import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { File } from './File.js';
import {
  createTestFile,
  createTestFiles,
  createMockUserId,
} from '../test/helpers.js';
import { setupMongoTestDB } from '../test/setup.js';

setupMongoTestDB();

describe('File Model', () => {

  describe('validation', () => {
    it('should require gridFsId', async () => {
      const file = new File({
        userId: createMockUserId(),
        filename: 'test.csv',
        originalName: 'test.csv',
        contentType: 'text/csv',
        size: 1024,
      });

      await expect(file.save()).rejects.toThrow('GridFS ID is required');
    });

    it('should require userId', async () => {
      const file = new File({
        gridFsId: new Types.ObjectId(),
        filename: 'test.csv',
        originalName: 'test.csv',
        contentType: 'text/csv',
        size: 1024,
      });

      await expect(file.save()).rejects.toThrow('User ID is required');
    });

    it('should require filename', async () => {
      const file = new File({
        gridFsId: new Types.ObjectId(),
        userId: createMockUserId(),
        originalName: 'test.csv',
        contentType: 'text/csv',
        size: 1024,
      });

      await expect(file.save()).rejects.toThrow('Filename is required');
    });

    it('should require originalName', async () => {
      const file = new File({
        gridFsId: new Types.ObjectId(),
        userId: createMockUserId(),
        filename: 'test.csv',
        contentType: 'text/csv',
        size: 1024,
      });

      await expect(file.save()).rejects.toThrow('Original filename is required');
    });

    it('should require size', async () => {
      const file = new File({
        gridFsId: new Types.ObjectId(),
        userId: createMockUserId(),
        filename: 'test.csv',
        originalName: 'test.csv',
        contentType: 'text/csv',
      });

      await expect(file.save()).rejects.toThrow('File size is required');
    });

    it('should not allow negative size', async () => {
      const file = new File({
        gridFsId: new Types.ObjectId(),
        userId: createMockUserId(),
        filename: 'test.csv',
        originalName: 'test.csv',
        contentType: 'text/csv',
        size: -1,
      });

      await expect(file.save()).rejects.toThrow('File size cannot be negative');
    });

    it('should default contentType to application/octet-stream', async () => {
      const file = new File({
        gridFsId: new Types.ObjectId(),
        userId: createMockUserId(),
        filename: 'test.bin',
        originalName: 'test.bin',
        size: 1024,
      });

      await file.save();

      expect(file.contentType).toBe('application/octet-stream');
    });

    it('should default deletedAt to null', async () => {
      const file = await createTestFile();

      expect(file.deletedAt).toBeNull();
    });

    it('should allow optional projectId', async () => {
      const userId = createMockUserId();
      const projectId = new Types.ObjectId();

      const file = await createTestFile({ userId, projectId });

      expect(file.projectId?.toString()).toBe(projectId.toString());
    });

    it('should allow file without projectId', async () => {
      const file = await createTestFile();

      expect(file.projectId).toBeUndefined();
    });
  });


  describe('soft delete', () => {
    it('should set deletedAt on softDelete()', async () => {
      const file = await createTestFile();
      expect(file.deletedAt).toBeNull();

      await file.softDelete();

      expect(file.deletedAt).toBeInstanceOf(Date);
      expect(file.isDeleted()).toBe(true);
    });

    it('should clear deletedAt on restore()', async () => {
      const file = await createTestFile({ deleted: true });
      expect(file.deletedAt).toBeInstanceOf(Date);

      await file.restore();

      expect(file.deletedAt).toBeNull();
      expect(file.isDeleted()).toBe(false);
    });

    it('should return true for isDeleted() when deleted', async () => {
      const file = await createTestFile({ deleted: true });

      expect(file.isDeleted()).toBe(true);
    });

    it('should return false for isDeleted() when not deleted', async () => {
      const file = await createTestFile();

      expect(file.isDeleted()).toBe(false);
    });

    it('should exclude deleted files from findByUser()', async () => {
      const userId = createMockUserId();

      await createTestFile({ userId, filename: 'active1.csv' });
      await createTestFile({ userId, filename: 'active2.csv' });
      await createTestFile({ userId, filename: 'active3.csv' });
      await createTestFile({ userId, filename: 'deleted1.csv', deleted: true });
      await createTestFile({ userId, filename: 'deleted2.csv', deleted: true });

      const files = await File.findByUser(userId);

      expect(files).toHaveLength(3);
      expect(files.every((f) => !f.deletedAt)).toBe(true);
    });

    it('should exclude deleted files from findByIdAndUser()', async () => {
      const userId = createMockUserId();
      const file = await createTestFile({ userId, deleted: true });

      const found = await File.findByIdAndUser(
        file._id.toString(),
        userId.toString()
      );

      expect(found).toBeNull();
    });
  });


  describe('findByUser', () => {
    it('should return files for a specific user', async () => {
      const userId1 = createMockUserId();
      const userId2 = createMockUserId();

      await createTestFiles(userId1, 3);
      await createTestFiles(userId2, 2);

      const user1Files = await File.findByUser(userId1);
      const user2Files = await File.findByUser(userId2);

      expect(user1Files).toHaveLength(3);
      expect(user2Files).toHaveLength(2);
    });

    it('should sort by createdAt descending', async () => {
      const userId = createMockUserId();

      await createTestFile({ userId, filename: 'first.csv' });
      await new Promise((r) => setTimeout(r, 10));
      await createTestFile({ userId, filename: 'second.csv' });
      await new Promise((r) => setTimeout(r, 10));
      await createTestFile({ userId, filename: 'third.csv' });

      const files = await File.findByUser(userId);

      expect(files[0].filename).toBe('third.csv');
      expect(files[2].filename).toBe('first.csv');
    });

    it('should return empty array for user with no files', async () => {
      const userId = createMockUserId();

      const files = await File.findByUser(userId);

      expect(files).toHaveLength(0);
    });
  });

  describe('findByProject', () => {
    it('should return files for a specific project', async () => {
      const userId = createMockUserId();
      const projectId1 = new Types.ObjectId();
      const projectId2 = new Types.ObjectId();

      await createTestFiles(userId, 3, projectId1);
      await createTestFiles(userId, 2, projectId2);

      const project1Files = await File.findByProject(projectId1);
      const project2Files = await File.findByProject(projectId2);

      expect(project1Files).toHaveLength(3);
      expect(project2Files).toHaveLength(2);
    });

    it('should exclude deleted files', async () => {
      const userId = createMockUserId();
      const projectId = new Types.ObjectId();

      await createTestFile({ userId, projectId, filename: 'active.csv' });
      await createTestFile({
        userId,
        projectId,
        filename: 'deleted.csv',
        deleted: true,
      });

      const files = await File.findByProject(projectId);

      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe('active.csv');
    });
  });

  describe('findByIdAndUser', () => {
    it('should find file by id and user', async () => {
      const userId = createMockUserId();
      const file = await createTestFile({ userId, filename: 'myfile.csv' });

      const found = await File.findByIdAndUser(
        file._id.toString(),
        userId.toString()
      );

      expect(found).not.toBeNull();
      expect(found!.filename).toBe('myfile.csv');
    });

    it('should return null for wrong user', async () => {
      const userId1 = createMockUserId();
      const userId2 = createMockUserId();
      const file = await createTestFile({ userId: userId1 });

      const found = await File.findByIdAndUser(
        file._id.toString(),
        userId2.toString()
      );

      expect(found).toBeNull();
    });

    it('should return null for non-existent file', async () => {
      const userId = createMockUserId();
      const fakeId = new Types.ObjectId();

      const found = await File.findByIdAndUser(
        fakeId.toString(),
        userId.toString()
      );

      expect(found).toBeNull();
    });
  });

  describe('findWithDeleted', () => {
    it('should include deleted files', async () => {
      const userId = createMockUserId();

      await createTestFile({ userId, filename: 'active.csv' });
      await createTestFile({ userId, filename: 'deleted.csv', deleted: true });

      const all = await File.findWithDeleted({ userId });

      expect(all).toHaveLength(2);
    });
  });


  describe('toPublic', () => {
    it('should return public representation', async () => {
      const userId = createMockUserId();
      const projectId = new Types.ObjectId();
      const file = await createTestFile({
        userId,
        projectId,
        filename: 'test.csv',
        originalName: 'original.csv',
        contentType: 'text/csv',
        size: 2048,
      });

      const publicData = file.toPublic();

      expect(publicData.id).toBe(file._id.toString());
      expect(publicData.filename).toBe('test.csv');
      expect(publicData.originalName).toBe('original.csv');
      expect(publicData.contentType).toBe('text/csv');
      expect(publicData.size).toBe(2048);
      expect(publicData.projectId).toBe(projectId.toString());
      expect(publicData.createdAt).toBeInstanceOf(Date);
    });

    it('should not include userId, gridFsId, or deletedAt in public data', async () => {
      const file = await createTestFile();

      const publicData = file.toPublic();

      expect((publicData as unknown as Record<string, unknown>).userId).toBeUndefined();
      expect((publicData as unknown as Record<string, unknown>).gridFsId).toBeUndefined();
      expect((publicData as unknown as Record<string, unknown>).deletedAt).toBeUndefined();
    });

    it('should handle missing projectId', async () => {
      const file = await createTestFile();

      const publicData = file.toPublic();

      expect(publicData.projectId).toBeUndefined();
    });
  });


  describe('timestamps', () => {
    it('should set createdAt on creation', async () => {
      const file = await createTestFile();

      expect(file.createdAt).toBeInstanceOf(Date);
    });

    it('should set updatedAt on creation', async () => {
      const file = await createTestFile();

      expect(file.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on save', async () => {
      const file = await createTestFile();
      const originalUpdatedAt = file.updatedAt;

      await new Promise((r) => setTimeout(r, 10));

      file.filename = 'updated.csv';
      await file.save();

      expect(file.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );
    });
  });
});
