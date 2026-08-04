import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { setupMongoTestDB } from '../../support/setup.js';
import { createFilesTestApp } from '../../support/filesTestApp.js';
import { createDefaultMockUser, type MockUser } from '../../support/testApp.js';
import { createTestProject } from '../../support/helpers.js';
import { User } from '../../../src/models/User.js';

setupMongoTestDB();

function uploadSample(
  app: ReturnType<typeof createFilesTestApp>,
  overrides: { filename?: string; contents?: string; projectId?: string } = {}
) {
  return request(app)
    .post('/api/files/upload')
    .attach(
      'file',
      Buffer.from(overrides.contents ?? 'a,b,c\n1,2,3\n'),
      overrides.filename ?? 'data.csv'
    )
    .field(overrides.projectId ? { projectId: overrides.projectId } : {});
}

describe('Files API', () => {
  let mockUser: MockUser;
  let app: ReturnType<typeof createFilesTestApp>;

  beforeEach(async () => {
    mockUser = createDefaultMockUser();
    app = createFilesTestApp(mockUser);
    await User.create({
      _id: new Types.ObjectId(mockUser.userId),
      email: mockUser.email,
      name: 'Test User',
      tier: 'guest',
      googleId: `google-${mockUser.userId}`,
    });
  });

  describe('POST /api/files/upload', () => {
    it('uploads a CSV file and returns its metadata', async () => {
      const response = await uploadSample(app).expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.file.filename).toBe('data.csv');
      expect(response.body.data.file.contentType).toBe('text/csv');
      expect(response.body.data.file.id).toBeDefined();
    });

    it('rejects requests with no file', async () => {
      const response = await request(app).post('/api/files/upload').expect(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects files over the tier size limit', async () => {
      const response = await uploadSample(app, {
        contents: 'x'.repeat(3 * 1024 * 1024),
      }).expect(413);
      expect(response.body.success).toBe(false);
    });

    it('rejects disallowed file types', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .attach('file', Buffer.from('not a spreadsheet'), 'malware.exe')
        .expect(400);
      expect(response.body.success).toBe(false);
    });

    it('associates the file with a project when projectId is provided', async () => {
      const project = await createTestProject({ userId: new Types.ObjectId(mockUser.userId) });
      const response = await uploadSample(app, { projectId: project._id.toString() }).expect(201);
      expect(response.body.success).toBe(true);
    });

    it('rejects an invalid projectId format', async () => {
      const response = await uploadSample(app, { projectId: 'not-an-id' }).expect(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects a projectId that does not belong to the user', async () => {
      const project = await createTestProject({ userId: new Types.ObjectId() });
      const response = await uploadSample(app, { projectId: project._id.toString() }).expect(404);
      expect(response.body.success).toBe(false);
    });

    it('returns the existing file when the same idempotency key is replayed', async () => {
      const idempotencyKey = 'retry-key-1';
      const first = await request(app)
        .post('/api/files/upload')
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', Buffer.from('a,b\n1,2\n'), 'idempotent.csv')
        .expect(201);

      const second = await request(app)
        .post('/api/files/upload')
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', Buffer.from('a,b\n1,2\n'), 'idempotent.csv')
        .expect(200);

      expect(second.body.data.file.id).toBe(first.body.data.file.id);
    });

    it('rejects a reused idempotency key with different file data', async () => {
      const idempotencyKey = 'retry-key-2';
      await request(app)
        .post('/api/files/upload')
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', Buffer.from('a,b\n1,2\n'), 'first.csv')
        .expect(201);

      const response = await request(app)
        .post('/api/files/upload')
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', Buffer.from('x,y\n9,9\n'), 'second.csv')
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/files', () => {
    it('returns an empty list for a user with no files', async () => {
      const response = await request(app).get('/api/files').expect(200);
      expect(response.body.data.files).toHaveLength(0);
    });

    it('returns only the requesting users files', async () => {
      await uploadSample(app).expect(201);

      const otherUser = createDefaultMockUser();
      const otherApp = createFilesTestApp(otherUser);
      await User.create({
        _id: new Types.ObjectId(otherUser.userId),
        email: otherUser.email,
        name: 'Other User',
        tier: 'guest',
        googleId: `google-${otherUser.userId}`,
      });
      await uploadSample(otherApp, { filename: 'other.csv' }).expect(201);

      const response = await request(app).get('/api/files').expect(200);
      expect(response.body.data.files).toHaveLength(1);
      expect(response.body.data.files[0].filename).toBe('data.csv');
    });
  });

  describe('GET /api/files/:id', () => {
    it('downloads a previously uploaded file', async () => {
      const uploadResponse = await uploadSample(app, { contents: 'hello,world\n' }).expect(201);
      const fileId = uploadResponse.body.data.file.id;

      const response = await request(app).get(`/api/files/${fileId}`).expect(200);
      expect(response.text).toContain('hello,world');
      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('returns 404 for a non-existent file', async () => {
      const response = await request(app)
        .get(`/api/files/${new Types.ObjectId()}`)
        .expect(404);
      expect(response.body.success).toBe(false);
    });

    it('returns 400 for a malformed file id', async () => {
      const response = await request(app).get('/api/files/not-an-id').expect(400);
      expect(response.body.success).toBe(false);
    });

    it("does not allow downloading another user's file", async () => {
      const uploadResponse = await uploadSample(app).expect(201);
      const fileId = uploadResponse.body.data.file.id;

      const otherUser = createDefaultMockUser();
      const otherApp = createFilesTestApp(otherUser);
      const response = await request(otherApp).get(`/api/files/${fileId}`).expect(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/files/:id/metadata', () => {
    it('returns file metadata without downloading the contents', async () => {
      const uploadResponse = await uploadSample(app).expect(201);
      const fileId = uploadResponse.body.data.file.id;

      const response = await request(app).get(`/api/files/${fileId}/metadata`).expect(200);
      expect(response.body.data.file.filename).toBe('data.csv');
    });

    it('returns 404 for a non-existent file', async () => {
      const response = await request(app)
        .get(`/api/files/${new Types.ObjectId()}/metadata`)
        .expect(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('deletes a file owned by the user', async () => {
      const uploadResponse = await uploadSample(app).expect(201);
      const fileId = uploadResponse.body.data.file.id;

      const response = await request(app).delete(`/api/files/${fileId}`).expect(200);
      expect(response.body.success).toBe(true);

      await request(app).get(`/api/files/${fileId}`).expect(404);
    });

    it('returns 404 when deleting a non-existent file', async () => {
      const response = await request(app)
        .delete(`/api/files/${new Types.ObjectId()}`)
        .expect(404);
      expect(response.body.success).toBe(false);
    });

    it('returns 400 for a malformed file id', async () => {
      const response = await request(app).delete('/api/files/not-an-id').expect(400);
      expect(response.body.success).toBe(false);
    });

    it('refuses to delete a file still referenced by an active project', async () => {
      const uploadResponse = await uploadSample(app).expect(201);
      const fileId = uploadResponse.body.data.file.id;

      await createTestProject({
        userId: new Types.ObjectId(mockUser.userId),
        nodes: {
          node1: {
            id: 'node1',
            kind: 'source_table',
            name: 'Node 1',
            ui: { position: { x: 0, y: 0 } },
            plan: { fileRef: fileId },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      const response = await request(app).delete(`/api/files/${fileId}`).expect(409);
      expect(response.body.success).toBe(false);
    });
  });
});
