import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRoutes from './auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { User } from '../models/User.js';
import {
  generateRefreshToken,
  getRefreshTokenExpiryDate,
  hashPassword,
  hashRefreshToken,
  revokeLegacyRefreshSessions,
} from '../services/auth.service.js';
import { setupMongoTestDB } from '../test/setup.js';
import { config } from '../config/env.js';

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
    const loserCookies = loser?.headers['set-cookie'];
    expect(
      Array.isArray(loserCookies) ? loserCookies.join('; ') : loserCookies,
    ).toContain('refresh_token=;');
    const refreshed = await User.findById(user.id);
    expect(refreshed?.refreshTokens).toHaveLength(1);
    expect(refreshed?.refreshTokens[0].tokenHash)
      .not.toBe(hashRefreshToken(refreshToken));
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
