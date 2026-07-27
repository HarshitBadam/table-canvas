import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { setupMongoTestDB } from '../test/setup.js';
import { createApiRateLimit } from './apiRateLimit.js';
import type { AuthenticatedRequest } from '../types/index.js';

setupMongoTestDB();

let prefixCounter = 0;

function app(userId?: string) {
  prefixCounter += 1;
  const instance = express();
  instance.use((req: Request, _res: Response, next: NextFunction) => {
    if (userId) {
      (req as AuthenticatedRequest).user = {
        userId,
        email: `${userId}@example.com`,
      };
    }
    next();
  });
  instance.use(createApiRateLimit({
    prefix: `test-limit-${prefixCounter}`,
    windowMs: 60_000,
    limit: 2,
    message: 'Slow down',
  }));
  instance.all('/api/test', (_req, res) => res.json({ success: true }));
  return instance;
}

describe('Authenticated API rate limiting', () => {
  it('rejects the request after the limit with the API error shape', async () => {
    const instance = app('user-a');

    await request(instance).post('/api/test').expect(200);
    await request(instance).post('/api/test').expect(200);
    const blocked = await request(instance).post('/api/test').expect(429);

    expect(blocked.body).toEqual({ success: false, error: 'Slow down' });
  });

  it('gives each account its own budget from the same address', async () => {
    prefixCounter += 1;
    const prefix = `test-shared-${prefixCounter}`;
    const limiter = createApiRateLimit({
      prefix,
      windowMs: 60_000,
      limit: 2,
      message: 'Slow down',
    });
    const instance = express();
    instance.use((req: Request, _res: Response, next: NextFunction) => {
      (req as AuthenticatedRequest).user = {
        userId: req.get('X-Test-User') ?? 'unknown',
        email: 'test@example.com',
      };
      next();
    });
    instance.use(limiter);
    instance.all('/api/test', (_req, res) => res.json({ success: true }));

    await request(instance).post('/api/test').set('X-Test-User', 'first').expect(200);
    await request(instance).post('/api/test').set('X-Test-User', 'first').expect(200);
    await request(instance).post('/api/test').set('X-Test-User', 'first').expect(429);
    await request(instance).post('/api/test').set('X-Test-User', 'second').expect(200);
  });

  it('falls back to the address when no account is attached', async () => {
    const instance = app();

    await request(instance).post('/api/test').expect(200);
    await request(instance).post('/api/test').expect(200);
    await request(instance).post('/api/test').expect(429);
  });
});
