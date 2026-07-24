import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadConfig() {
  return import('./env.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv(
    'MONGODB_URI',
    'mongodb+srv://portfolio.example.mongodb.net/table-canvas',
  );
  vi.stubEnv('JWT_ACCESS_SECRET', 'a'.repeat(64));
  vi.stubEnv('JWT_REFRESH_SECRET', 'b'.repeat(64));
  vi.stubEnv('FRONTEND_URL', 'https://app.example.com');
  vi.stubEnv('TRUST_PROXY', 'loopback, linklocal, uniquelocal');
  vi.stubEnv('COOKIE_SAME_SITE', 'strict');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('production environment validation', () => {
  it('accepts a hardened production configuration', async () => {
    const { validateConfig } = await loadConfig();
    expect(() => validateConfig()).not.toThrow();
  });

  it('rejects short or reused JWT secrets', async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'same-secret');
    vi.stubEnv('JWT_REFRESH_SECRET', 'same-secret');
    const { validateConfig } = await loadConfig();
    expect(() => validateConfig()).toThrow(/at least 32 characters/);
  });

  it('rejects local production databases', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/table-canvas');
    const { validateConfig } = await loadConfig();
    expect(() => validateConfig()).toThrow(/must not target localhost/);
  });

  it('rejects non-HTTPS frontend origins', async () => {
    vi.stubEnv('FRONTEND_URL', 'http://app.example.com');
    const { validateConfig } = await loadConfig();
    expect(() => validateConfig()).toThrow(/must use HTTPS/);
  });

  it('rejects empty or non-origin frontend allowlists', async () => {
    vi.stubEnv('FRONTEND_URL', ' , ');
    let loaded = await loadConfig();
    expect(() => loaded.validateConfig()).toThrow(/at least one trusted HTTPS origin/);

    vi.resetModules();
    vi.stubEnv('FRONTEND_URL', 'https://app.example.com/path');
    loaded = await loadConfig();
    expect(() => loaded.validateConfig()).toThrow(/origins without paths/);
  });

  it('rejects unrestricted proxy trust', async () => {
    vi.stubEnv('TRUST_PROXY', '0.0.0.0/0');
    const { validateConfig } = await loadConfig();
    expect(() => validateConfig()).toThrow(/trusted proxy ranges/);
  });

  it('requires explicit proxy trust and parses a trusted hop count', async () => {
    vi.stubEnv('TRUST_PROXY', '');
    let loaded = await loadConfig();
    expect(() => loaded.validateConfig()).toThrow(/explicitly configured/);

    vi.resetModules();
    vi.stubEnv('TRUST_PROXY', '1');
    loaded = await loadConfig();
    expect(loaded.config.trustProxy).toBe(1);
    expect(() => loaded.validateConfig()).not.toThrow();
  });

  it('allows production deployments without Google OAuth', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const { validateConfig } = await loadConfig();
    expect(() => validateConfig()).not.toThrow();
  });
});
