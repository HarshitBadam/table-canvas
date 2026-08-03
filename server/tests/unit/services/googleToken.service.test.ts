import { describe, expect, it, vi, beforeEach } from 'vitest';

const verifyIdToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function OAuth2ClientMock() {
    return { verifyIdToken };
  }),
}));

vi.mock('../../../src/config/env.js', () => ({
  config: { googleClientId: 'test-client-id' },
}));

import { verifyGoogleToken } from '../../../src/services/google.service.js';

describe('verifyGoogleToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a valid Google payload to GoogleUserInfo', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-user-1',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    const result = await verifyGoogleToken('id-token');

    expect(result).toEqual({
      googleId: 'google-user-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/pic.jpg',
    });
  });

  it('falls back to the email prefix when name is missing', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-user-2',
        email: 'noname@example.com',
      }),
    });

    const result = await verifyGoogleToken('id-token');

    expect(result.name).toBe('noname');
    expect(result.avatarUrl).toBeUndefined();
  });

  it('throws when the payload is empty', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => undefined });

    await expect(verifyGoogleToken('id-token')).rejects.toThrow('empty payload');
  });

  it('throws when required claims are missing', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'google-user-3' }),
    });

    await expect(verifyGoogleToken('id-token')).rejects.toThrow('missing required claims');
  });

  it('propagates verification errors from the OAuth client', async () => {
    verifyIdToken.mockRejectedValue(new Error('Token used too late'));

    await expect(verifyGoogleToken('id-token')).rejects.toThrow('Token used too late');
  });
});
