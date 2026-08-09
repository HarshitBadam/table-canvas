import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRoutes from '../../../src/routes/auth.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import { User } from '../../../src/models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiryDate,
  hashPassword,
  hashRefreshToken,
  revokeLegacyRefreshSessions,
} from '../../../src/services/auth.service.js';
import { setupMongoTestDB } from '../../support/setup.js';
import { config } from '../../../src/config/env.js';

setupMongoTestDB();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

describe('Auth API session lifecycle', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('enforces the public registration policy', async () => {
    const mutableConfig = config as { registrationEnabled: boolean };
    const previous = mutableConfig.registrationEnabled;
    mutableConfig.registrationEnabled = false;
    try {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'blocked@example.com',
          name: 'Blocked User',
          password: 'SecurePass1',
        })
        .expect(403);
    } finally {
      mutableConfig.registrationEnabled = previous;
    }
  });

  it('stores only a hash of a refresh token after login', async () => {
    await User.create({
      email: 'login@example.com',
      name: 'Login User',
      passwordHash: await hashPassword('SecurePass1'),
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'SecurePass1' })
      .expect(200);

    expect(response.headers['set-cookie']).toBeDefined();
    const user = await User.findByEmail('login@example.com');
    expect(user?.refreshTokens).toHaveLength(1);
    expect(user?.refreshTokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('unions discovery tour completion idempotently for the authenticated user', async () => {
    const user = await User.create({
      email: 'discovery@example.com',
      name: 'Discovery User',
      passwordHash: await hashPassword('SecurePass1'),
      discoveryTours: {
        version: 1,
        completedTours: ['canvas'],
      },
    });
    const accessToken = generateAccessToken(user.id, user.email);

    const response = await request(app)
      .put('/api/auth/me/discovery-tours')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, completedTours: ['canvas', 'report'] })
      .expect(200);

    expect(response.body.data.discoveryTours).toEqual({
      version: 1,
      completedTours: ['canvas', 'report'],
    });
    expect((await User.findById(user.id))?.discoveryTours?.completedTours)
      .toEqual(['canvas', 'report']);
  });

  it('does not lose discovery completion from concurrent tabs', async () => {
    const user = await User.create({
      email: 'concurrent-discovery@example.com',
      name: 'Concurrent Discovery User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    const accessToken = generateAccessToken(user.id, user.email);

    await Promise.all([
      request(app)
        .put('/api/auth/me/discovery-tours')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 1, completedTours: ['canvas'] })
        .expect(200),
      request(app)
        .put('/api/auth/me/discovery-tours')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 1, completedTours: ['report'] })
        .expect(200),
    ]);

    expect((await User.findById(user.id))?.discoveryTours?.completedTours)
      .toEqual(expect.arrayContaining(['canvas', 'report']));
  });

  it('resets stale discovery state to the current version before merging', async () => {
    const user = await User.create({
      email: 'stale-discovery@example.com',
      name: 'Stale Discovery User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    await User.collection.updateOne(
      { _id: user._id },
      { $set: { discoveryTours: { version: 0, completedTours: ['canvas'] } } },
    );
    const accessToken = generateAccessToken(user.id, user.email);

    const response = await request(app)
      .put('/api/auth/me/discovery-tours')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, completedTours: ['grid'] })
      .expect(200);

    expect(response.body.data.discoveryTours).toEqual({
      version: 1,
      completedTours: ['grid'],
    });
  });

  it('validates and authenticates discovery completion updates', async () => {
    await request(app)
      .put('/api/auth/me/discovery-tours')
      .send({ version: 1, completedTours: ['canvas'] })
      .expect(401);

    const user = await User.create({
      email: 'invalid-discovery@example.com',
      name: 'Invalid Discovery User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    const accessToken = generateAccessToken(user.id, user.email);
    await request(app)
      .put('/api/auth/me/discovery-tours')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, completedTours: ['unknown'] })
      .expect(400);
    await request(app)
      .put('/api/auth/me/discovery-tours')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 2, completedTours: ['canvas'] })
      .expect(400);
  });

  it('allows exactly one atomic rotation of a refresh token', async () => {
    const user = await User.create({
      email: 'refresh@example.com',
      name: 'Refresh User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    const refreshToken = generateRefreshToken(user.id, user.email);
    user.refreshTokens.push({
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

    const calls = await Promise.all([
      request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`),
      request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`),
    ]);

    expect(calls.map(call => call.status).sort()).toEqual([200, 401]);
    const loser = calls.find(call => call.status === 401);
    expect(loser?.headers['set-cookie']).toBeUndefined();
    const refreshed = await User.findById(user.id);
    expect(refreshed?.refreshTokens).toHaveLength(1);
    expect(refreshed?.refreshTokens[0].tokenHash)
      .not.toBe(hashRefreshToken(refreshToken));
  });

  it('does not clear cookies for an invalid refresh JWT', async () => {
    // A stale/invalid token failure must never clear cookies: another tab's
    // concurrent login or refresh may have already installed valid ones for
    // this same browser, and this response could land after that one.
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=not-a-valid-jwt')
      .expect(401);

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('does not clear cookies for a refresh token that no longer matches any session', async () => {
    // Same rationale for the CAS-loser path: the token was valid JWT-wise but
    // no longer matches a stored session (already rotated by a winner).
    const user = await User.create({
      email: 'stale-cas@example.com',
      name: 'Stale CAS User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    const staleRefreshToken = generateRefreshToken(user.id, user.email);
    // Intentionally do not persist this token, simulating a token that was
    // already rotated out from under this request.

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${staleRefreshToken}`)
      .expect(401);

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('does not resurrect a rotated token during concurrent login', async () => {
    const user = await User.create({
      email: 'concurrent@example.com',
      name: 'Concurrent User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    const refreshToken = generateRefreshToken(user.id, user.email);
    user.refreshTokens.push({
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

    const [login, refresh] = await Promise.all([
      request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'SecurePass1' }),
      request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`),
    ]);

    expect(login.status).toBe(200);
    expect(refresh.status).toBe(200);
    const updated = await User.findById(user.id);
    expect(updated?.refreshTokens).toHaveLength(2);
    expect(updated?.refreshTokens.some(
      token => token.tokenHash === hashRefreshToken(refreshToken),
    )).toBe(false);
  });

  it('revokes legacy plaintext refresh sessions during migration', async () => {
    const user = await User.create({
      email: 'legacy@example.com',
      name: 'Legacy User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    await User.collection.updateOne(
      { _id: user._id },
      {
        $set: {
          refreshTokens: [{
            token: 'legacy-plaintext-token',
            expiresAt: getRefreshTokenExpiryDate(),
          }],
        },
      },
    );

    await revokeLegacyRefreshSessions();

    expect((await User.findById(user.id))?.refreshTokens).toEqual([]);
  });

  it('revokes the current refresh token on logout', async () => {
    const user = await User.create({
      email: 'logout@example.com',
      name: 'Logout User',
      passwordHash: await hashPassword('SecurePass1'),
    });
    const refreshToken = generateRefreshToken(user.id, user.email);
    user.refreshTokens.push({
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: getRefreshTokenExpiryDate(),
    });
    await user.save();

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(200);

    expect((await User.findById(user.id))?.refreshTokens).toHaveLength(0);
  });
});
