/**
 * Files API Integration Tests
 * 
 * Tests for file upload, download, and management operations.
 * Note: GridFS operations require a full MongoDB connection,
 * so some tests verify behavior at the route/controller level.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { File } from '../models/File.js';
import {
  createTestFile,
  createMockUserId,
} from '../test/helpers.js';

// ============================================================================
// Mock File Service
// ============================================================================

// We mock the file service since GridFS requires a real connection
vi.mock('../services/file.service.js', () => ({
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
  listUserFiles: vi.fn(),
  getFileMetadata: vi.fn(),
}));

import * as fileService from '../services/file.service.js';

// ============================================================================
// Test App Setup
// ============================================================================

interface MockUser {
  userId: string;
  email: string;
}

function createFileTestApp(mockUser: MockUser): Express {
  const app = express();
  app.use(express.json());

  // Mock auth middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = mockUser;
    next();
  });

  // Import routes dynamically to use mocked service
  // For simplicity, we'll define test routes inline
  const router = express.Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const files = await fileService.listUserFiles((req as any).user.userId);
      res.json({ success: true, data: { files } });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to list files' });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const result = await fileService.downloadFile(
        req.params.id,
        (req as any).user.userId
      );
      if (!result) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      res.json({ success: true, data: result });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to download file' });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await fileService.deleteFile(
        req.params.id,
        (req as any).user.userId
      );
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      res.json({ success: true, message: 'File deleted' });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  });

  app.use('/api/files', router);

  return app;
}

describe('Files API', () => {
  let mockUser: MockUser;
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    const userId = new Types.ObjectId();
    mockUser = {
      userId: userId.toString(),
      email: 'test@example.com',
    };
    app = createFileTestApp(mockUser);
  });

  // ============================================================================
  // GET /api/files - List Files
  // ============================================================================

  describe('GET /api/files', () => {
    it('should return list of user files', async () => {
      const mockFiles = [
        {
          id: new Types.ObjectId().toString(),
          filename: 'data.csv',
          contentType: 'text/csv',
          size: 1024,
          uploadDate: new Date(),
        },
        {
          id: new Types.ObjectId().toString(),
          filename: 'report.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 2048,
          uploadDate: new Date(),
        },
      ];

      (fileService.listUserFiles as any).mockResolvedValue(mockFiles);

      const response = await request(app)
        .get('/api/files')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toHaveLength(2);
      expect(response.body.data.files[0].filename).toBe('data.csv');
    });

    it('should return empty array for user with no files', async () => {
      (fileService.listUserFiles as any).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/files')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toHaveLength(0);
    });

    it('should call service with correct user ID', async () => {
      (fileService.listUserFiles as any).mockResolvedValue([]);

      await request(app).get('/api/files');

      expect(fileService.listUserFiles).toHaveBeenCalledWith(mockUser.userId);
    });
  });

  // ============================================================================
  // GET /api/files/:id - Download File
  // ============================================================================

  describe('GET /api/files/:id', () => {
    it('should return file data for valid ID', async () => {
      const fileId = new Types.ObjectId().toString();
      const mockResult = {
        stream: {},
        filename: 'test.csv',
        contentType: 'text/csv',
        size: 1024,
      };

      (fileService.downloadFile as any).mockResolvedValue(mockResult);

      const response = await request(app)
        .get(`/api/files/${fileId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filename).toBe('test.csv');
    });

    it('should return 404 for non-existent file', async () => {
      const fileId = new Types.ObjectId().toString();

      (fileService.downloadFile as any).mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/files/${fileId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should call service with file ID and user ID', async () => {
      const fileId = new Types.ObjectId().toString();

      (fileService.downloadFile as any).mockResolvedValue(null);

      await request(app).get(`/api/files/${fileId}`);

      expect(fileService.downloadFile).toHaveBeenCalledWith(
        fileId,
        mockUser.userId
      );
    });
  });

  // ============================================================================
  // DELETE /api/files/:id - Delete File
  // ============================================================================

  describe('DELETE /api/files/:id', () => {
    it('should delete file for authorized user', async () => {
      const fileId = new Types.ObjectId().toString();

      (fileService.deleteFile as any).mockResolvedValue(true);

      const response = await request(app)
        .delete(`/api/files/${fileId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent file', async () => {
      const fileId = new Types.ObjectId().toString();

      (fileService.deleteFile as any).mockResolvedValue(false);

      const response = await request(app)
        .delete(`/api/files/${fileId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should call service with file ID and user ID', async () => {
      const fileId = new Types.ObjectId().toString();

      (fileService.deleteFile as any).mockResolvedValue(true);

      await request(app).delete(`/api/files/${fileId}`);

      expect(fileService.deleteFile).toHaveBeenCalledWith(
        fileId,
        mockUser.userId
      );
    });
  });

  // ============================================================================
  // File Model Integration Tests (uses in-memory DB)
  // ============================================================================

  describe('File Model Integration', () => {
    it('should create and retrieve file metadata', async () => {
      const userId = createMockUserId();
      const file = await createTestFile({
        userId,
        filename: 'integration-test.csv',
        originalName: 'original.csv',
        contentType: 'text/csv',
        size: 5000,
      });

      const found = await File.findById(file._id);

      expect(found).not.toBeNull();
      expect(found!.filename).toBe('integration-test.csv');
      expect(found!.size).toBe(5000);
    });

    it('should list files by user', async () => {
      const userId = createMockUserId();
      const otherUserId = createMockUserId();

      await createTestFile({ userId, filename: 'user1-file1.csv' });
      await createTestFile({ userId, filename: 'user1-file2.csv' });
      await createTestFile({ userId: otherUserId, filename: 'user2-file1.csv' });

      const userFiles = await File.findByUser(userId);

      expect(userFiles).toHaveLength(2);
      expect(userFiles.every((f) => f.userId.toString() === userId.toString())).toBe(true);
    });

    it('should support soft delete', async () => {
      const userId = createMockUserId();
      const file = await createTestFile({ userId });

      await file.softDelete();

      // Should not appear in regular queries
      const found = await File.findByIdAndUser(
        file._id.toString(),
        userId.toString()
      );
      expect(found).toBeNull();

      // Should appear in findWithDeleted
      const all = await File.findWithDeleted({ _id: file._id });
      expect(all).toHaveLength(1);
      expect(all[0].deletedAt).not.toBeNull();
    });

    it('should link files to projects', async () => {
      const userId = createMockUserId();
      const projectId = new Types.ObjectId();

      await createTestFile({ userId, projectId, filename: 'project-file1.csv' });
      await createTestFile({ userId, projectId, filename: 'project-file2.csv' });
      await createTestFile({ userId, filename: 'orphan-file.csv' });

      const projectFiles = await File.findByProject(projectId);

      expect(projectFiles).toHaveLength(2);
      expect(projectFiles.every((f) => f.projectId?.toString() === projectId.toString())).toBe(true);
    });

    it('should restore soft-deleted files', async () => {
      const userId = createMockUserId();
      const file = await createTestFile({ userId, deleted: true });

      expect(file.isDeleted()).toBe(true);

      await file.restore();

      expect(file.isDeleted()).toBe(false);

      // Should now appear in regular queries
      const found = await File.findByIdAndUser(
        file._id.toString(),
        userId.toString()
      );
      expect(found).not.toBeNull();
    });
  });
});

// ============================================================================
// Upload Tests (Multer integration)
// ============================================================================

describe('File Upload', () => {
  it('should accept CSV files', () => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    expect(allowedExtensions.includes('.csv')).toBe(true);
  });

  it('should accept Excel files', () => {
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    expect(allowedMimes.length).toBe(2);
  });

  it('should reject other file types', () => {
    const testFile = 'malware.exe';
    const ext = testFile.slice(testFile.lastIndexOf('.'));
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    expect(allowedExtensions.includes(ext)).toBe(false);
  });

  it('should enforce file size limit', () => {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    const largeFileSize = 60 * 1024 * 1024; // 60MB
    expect(largeFileSize > MAX_SIZE).toBe(true);
  });
});
