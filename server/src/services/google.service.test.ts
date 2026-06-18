import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { User } from '../models/User.js';
import { hashPassword } from './auth.service.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { setupMongoTestDB } from '../test/setup.js';

setupMongoTestDB();

vi.mock('./google.service.js', () => ({
  verifyGoogleToken: vi.fn(),
}));

import { verifyGoogleToken } from './google.service.js';
import authRoutes from '../routes/auth.js';

const mockedVerify = vi.mocked(verifyGoogleToken);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

describe('POST /api/auth/google', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
    vi.clearAllMocks();
  });

  it('returns 400 when credential is missing', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('creates a new user on first Google login', async () => {
    mockedVerify.mockResolvedValueOnce({
      googleId: 'g-new-user',
      email: 'newgoogle@example.com',
      name: 'New Google User',
      avatarUrl: 'https://example.com/pic.jpg',
    });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('newgoogle@example.com');
    expect(res.body.data.user.name).toBe('New Google User');
    expect(res.body.data.user.tier).toBe('google');
    expect(res.body.data.user.avatarUrl).toBe('https://example.com/pic.jpg');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.refreshTokens).toBeUndefined();
  });

  it('returns the same user on repeat Google login', async () => {
    mockedVerify.mockResolvedValue({
      googleId: 'g-repeat',
      email: 'repeat@example.com',
      name: 'Repeat',
    });

    const res1 = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'tok' });

    expect(res1.status).toBe(200);
    const userId1 = res1.body.data.user.id;

    const res2 = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'tok' });

    expect(res2.status).toBe(200);
    expect(res2.body.data.user.id).toBe(userId1);
  });

  it('links Google to an existing email/password user', async () => {
    const pw = await hashPassword('Str0ngPass!');
    const existing = await User.create({
      email: 'linked@example.com',
      name: 'Existing PW User',
      passwordHash: pw,
      tier: 'google',
    });

    mockedVerify.mockResolvedValueOnce({
      googleId: 'g-link',
      email: 'linked@example.com',
      name: 'Existing PW User',
      avatarUrl: 'https://example.com/linked.jpg',
    });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'tok' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(existing._id.toString());

    const updated = await User.findById(existing._id);
    expect(updated!.googleId).toBe('g-link');
    expect(updated!.passwordHash).toBe(pw);
    expect(updated!.avatarUrl).toBe('https://example.com/linked.jpg');
  });

  it('does not overwrite existing avatarUrl when linking', async () => {
    const pw = await hashPassword('Str0ngPass!');
    await User.create({
      email: 'hasavatar@example.com',
      name: 'Has Avatar',
      passwordHash: pw,
      avatarUrl: 'https://example.com/original.jpg',
    });

    mockedVerify.mockResolvedValueOnce({
      googleId: 'g-avatar',
      email: 'hasavatar@example.com',
      name: 'Has Avatar',
      avatarUrl: 'https://example.com/new.jpg',
    });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'tok' });

    expect(res.status).toBe(200);
    const updated = await User.findOne({ googleId: 'g-avatar' });
    expect(updated!.avatarUrl).toBe('https://example.com/original.jpg');
  });

  it('sets cookies on successful Google login', async () => {
    mockedVerify.mockResolvedValueOnce({
      googleId: 'g-cookie',
      email: 'cookie@example.com',
      name: 'Cookie User',
    });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'tok' });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    expect(cookieStr).toContain('access_token');
    expect(cookieStr).toContain('refresh_token');
  });

  it('returns 401 when Google token is invalid', async () => {
    mockedVerify.mockRejectedValueOnce(new Error('Invalid token'));

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'bad-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
