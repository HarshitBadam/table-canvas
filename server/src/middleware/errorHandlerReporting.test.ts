import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';

const captureException = vi.fn();

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  close: vi.fn(async () => true),
  captureException: (...args: unknown[]) => captureException(...args),
}));

const DSN = 'https://public-key@o1.ingest.us.sentry.io/2';

beforeEach(() => {
  vi.resetModules();
  captureException.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('SENTRY_DSN', DSN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loadErrorHandler() {
  return import('./errorHandler.js');
}

function makeRequest(): Request {
  return {
    method: 'PUT',
    path: '/api/projects/6512c0a1b2c3d4e5f6a7b8c9',
    baseUrl: '/api/projects',
    route: { path: '/:id' },
    user: { userId: 'user-1', email: 'person@example.com' },
  } as unknown as Request;
}

function makeResponse() {
  const res = {
    statusCode: 0,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; payload: unknown };
}

const noop = (() => {}) as NextFunction;

describe('unexpected failure reporting', () => {
  it('reports an unhandled failure with the route pattern instead of the concrete path', async () => {
    const { errorHandler } = await loadErrorHandler();
    const res = makeResponse();

    errorHandler(new Error('mongo socket closed'), makeRequest(), res, noop);

    expect(res.statusCode).toBe(500);
    expect(captureException).toHaveBeenCalledOnce();
    const [error, context] = captureException.mock.calls[0] as [Error, Record<string, never>];
    expect(error.message).toBe('mongo socket closed');
    expect(context).toMatchObject({
      tags: { method: 'PUT', route: '/api/projects/:id', statusCode: '500' },
      user: { id: 'user-1' },
    });
  });

  it('never attaches the email address or the request body to a report', async () => {
    const { errorHandler } = await loadErrorHandler();

    errorHandler(new Error('boom'), makeRequest(), makeResponse(), noop);

    expect(JSON.stringify(captureException.mock.calls[0]?.[1])).not.toContain('person@example.com');
  });

  it('reports an AppError raised with a server-side status', async () => {
    const { AppError, errorHandler } = await loadErrorHandler();

    errorHandler(new AppError('upstream unavailable', 503), makeRequest(), makeResponse(), noop);

    expect(captureException).toHaveBeenCalledOnce();
  });

  it('stays silent when no DSN is configured', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    const { errorHandler } = await loadErrorHandler();

    errorHandler(new Error('boom'), makeRequest(), makeResponse(), noop);

    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('expected client errors are not incidents', () => {
  it.each([
    ['authentication', () => import('./errorHandler.js').then(m => new m.AuthenticationError())],
    ['not found', () => import('./errorHandler.js').then(m => new m.NotFoundError('Project'))],
    ['conflict', () => import('./errorHandler.js').then(m => new m.ConflictError('stale revision'))],
    ['validation', () => import('./errorHandler.js').then(m => new m.ValidationError(['name required']))],
  ])('does not report a %s failure', async (_label, build) => {
    const { errorHandler } = await loadErrorHandler();

    errorHandler(await build(), makeRequest(), makeResponse(), noop);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not report an oversized upload', async () => {
    const { errorHandler } = await loadErrorHandler();
    const res = makeResponse();

    errorHandler(new MulterError('LIMIT_FILE_SIZE'), makeRequest(), res, noop);

    expect(res.statusCode).toBe(413);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not report a rejected token', async () => {
    const { errorHandler } = await loadErrorHandler();
    const expired = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    const res = makeResponse();

    errorHandler(expired, makeRequest(), res, noop);

    expect(res.statusCode).toBe(401);
    expect(captureException).not.toHaveBeenCalled();
  });
});
