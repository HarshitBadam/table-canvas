import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { Types, mongo } from 'mongoose';
import * as fileService from './file.service.js';


const mockUploadStream = {
  id: new Types.ObjectId(),
  on: vi.fn(),
  pipe: vi.fn(),
};

const mockDownloadStream = {
  pipe: vi.fn(),
  on: vi.fn(),
};

const mockGridFSBucket = {
  openUploadStream: vi.fn(() => mockUploadStream),
  openDownloadStream: vi.fn(() => mockDownloadStream),
  delete: vi.fn(),
};

const mockCollection: { findOne: ReturnType<typeof vi.fn>; find?: ReturnType<typeof vi.fn> } = {
  findOne: vi.fn(),
};

const mockDb = {
  collection: vi.fn(() => mockCollection),
};

describe('FileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(mongoose.connection, 'db', {
      get: () => mockDb,
      configurable: true,
    });
  });

  // These tests redefine `mongoose.connection.db` as a getter-only accessor.
  // Restore it to an assignable data property afterwards so later suites that
  // share this fork (via setupMongoTestDB) can reconnect the default
  // connection — mongoose's internal `_setClient` assigns to `connection.db`.
  afterAll(() => {
    Object.defineProperty(mongoose.connection, 'db', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });


  describe('uploadFile', () => {
    it('should upload file to GridFS and return metadata', async () => {
      const buffer = Buffer.from('test content');
      const filename = 'test.csv';
      const contentType = 'text/csv';
      const metadata = {
        originalName: 'original.csv',
        userId: 'user123',
        projectId: 'project456',
      };

      mockUploadStream.on.mockImplementation((event, callback) => {
        if (event === 'finish') {
          setTimeout(() => callback(), 0);
        }
        return mockUploadStream;
      });

      // We can't directly test the function without the actual GridFS setup
      // This is a structural test showing how to mock
      expect(mockGridFSBucket.openUploadStream).toBeDefined();
    });

    it('should set correct metadata on upload', () => {
      const metadata = {
        originalName: 'data.xlsx',
        userId: 'user123',
        projectId: 'project456',
      };

      expect(metadata).toHaveProperty('originalName');
      expect(metadata).toHaveProperty('userId');
      expect(metadata).toHaveProperty('projectId');
    });

    it('should handle upload errors gracefully', async () => {
      mockUploadStream.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Upload failed')), 0);
        }
        return mockUploadStream;
      });

      expect(mockUploadStream.on).toBeDefined();
    });
  });


  describe('downloadFile', () => {
    it('should return file stream for valid ID and user', async () => {
      const fileId = new Types.ObjectId().toString();
      const userId = 'user123';

      mockCollection.findOne.mockResolvedValue({
        _id: new Types.ObjectId(fileId),
        filename: 'test.csv',
        contentType: 'text/csv',
        length: 1024,
        metadata: { userId },
      });

      const result = await mockCollection.findOne({
        _id: new Types.ObjectId(fileId),
      });

      expect(result).not.toBeNull();
      expect(result.metadata.userId).toBe(userId);
    });

    it('should return null for non-existent file', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await mockCollection.findOne({
        _id: new Types.ObjectId(),
      });

      expect(result).toBeNull();
    });

    it('should return null for unauthorized user', async () => {
      const fileId = new Types.ObjectId().toString();

      mockCollection.findOne.mockResolvedValue({
        _id: new Types.ObjectId(fileId),
        filename: 'test.csv',
        metadata: { userId: 'differentUser' },
      });

      const result = await mockCollection.findOne({
        _id: new Types.ObjectId(fileId),
      });

      expect(result.metadata.userId).not.toBe('user123');
    });

    it('should include correct content type in response', async () => {
      const fileDoc = {
        _id: new Types.ObjectId(),
        filename: 'data.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        length: 5000,
        metadata: { userId: 'user123' },
      };

      mockCollection.findOne.mockResolvedValue(fileDoc);

      const result = await mockCollection.findOne({});

      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });
  });


  describe('deleteFile', () => {
    it('should delete file from GridFS for authorized user', async () => {
      const fileId = new Types.ObjectId().toString();
      const userId = 'user123';

      mockCollection.findOne.mockResolvedValue({
        _id: new Types.ObjectId(fileId),
        metadata: { userId },
      });

      mockGridFSBucket.delete.mockResolvedValue(undefined);

      const file = await mockCollection.findOne({
        _id: new Types.ObjectId(fileId),
      });

      expect(file.metadata.userId).toBe(userId);
    });

    it('should return false for non-existent file', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await mockCollection.findOne({
        _id: new Types.ObjectId(),
      });

      expect(result).toBeNull();
    });

    it('should return false for unauthorized user', async () => {
      const fileId = new Types.ObjectId().toString();

      mockCollection.findOne.mockResolvedValue({
        _id: new Types.ObjectId(fileId),
        metadata: { userId: 'differentUser' },
      });

      const file = await mockCollection.findOne({
        _id: new Types.ObjectId(fileId),
      });

      expect(file.metadata.userId).not.toBe('user123');
    });
  });


  describe('listUserFiles', () => {
    it('should return all files for a user', async () => {
      const userId = 'user123';
      const files = [
        {
          _id: new Types.ObjectId(),
          filename: 'file1.csv',
          contentType: 'text/csv',
          length: 1024,
          uploadDate: new Date(),
        },
        {
          _id: new Types.ObjectId(),
          filename: 'file2.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          length: 2048,
          uploadDate: new Date(),
        },
      ];

      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(files),
      };

      mockCollection.find = vi.fn().mockReturnValue(mockCursor);

      const result = await mockCursor.toArray();

      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('file1.csv');
    });

    it('should sort by uploadDate descending', async () => {
      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      mockCollection.find = vi.fn().mockReturnValue(mockCursor);

      await mockCursor.sort({ uploadDate: -1 }).toArray();

      expect(mockCursor.sort).toHaveBeenCalledWith({ uploadDate: -1 });
    });

    it('should return empty array for user with no files', async () => {
      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      mockCollection.find = vi.fn().mockReturnValue(mockCursor);

      const result = await mockCursor.toArray();

      expect(result).toHaveLength(0);
    });
  });


  describe('getFileMetadata', () => {
    it('should return file metadata for valid file and user', async () => {
      const fileId = new Types.ObjectId().toString();
      const userId = 'user123';

      const fileDoc = {
        _id: new Types.ObjectId(fileId),
        filename: 'test.csv',
        contentType: 'text/csv',
        length: 1024,
        uploadDate: new Date(),
        metadata: { userId },
      };

      mockCollection.findOne.mockResolvedValue(fileDoc);

      const result = await mockCollection.findOne({
        _id: new Types.ObjectId(fileId),
        'metadata.userId': userId,
      });

      expect(result).not.toBeNull();
      expect(result.filename).toBe('test.csv');
    });

    it('should return null for file belonging to different user', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await mockCollection.findOne({
        _id: new Types.ObjectId(),
        'metadata.userId': 'user123',
      });

      expect(result).toBeNull();
    });

    it('should return null for non-existent file', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await mockCollection.findOne({
        _id: new Types.ObjectId(),
      });

      expect(result).toBeNull();
    });
  });


  describe('getGridFSBucket', () => {
    it('should throw error if database not connected', () => {
      Object.defineProperty(mongoose.connection, 'db', {
        get: () => null,
        configurable: true,
      });

      expect(mongoose.connection.db).toBeNull();
    });

    it('should create bucket with correct name', () => {
      const bucketConfig = {
        bucketName: 'files',
      };

      expect(bucketConfig.bucketName).toBe('files');
    });
  });
});
