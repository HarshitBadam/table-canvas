import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';

// We mock the file service since GridFS requires a real connection
vi.mock('../../../src/services/file.service.js', () => ({
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
  listUserFiles: vi.fn(),
  getFileMetadata: vi.fn(),
}));

import * as fileService from '../../../src/services/file.service.js';


interface MockUser {
  userId: string;
  email: string;
}

function createFileTestApp(mockUser: MockUser): Express {
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = mockUser;
    next();
  });

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
});
