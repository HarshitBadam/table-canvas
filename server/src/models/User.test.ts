import { describe, it, expect, beforeAll } from 'vitest';
import { User } from './User.js';
import { setupMongoTestDB } from '../test/setup.js';

setupMongoTestDB();

// Ensure indexes (sparse/unique googleId) are built before index-dependent tests.
beforeAll(async () => {
  await User.init();
});

describe('User model', () => {
  describe('passwordHash conditional required validator', () => {
    it('requires passwordHash when googleId is absent', () => {
      const user = new User({
        email: 'pw@example.com',
        name: 'Password User',
      });

      const err = user.validateSync();
      expect(err).toBeDefined();
      expect(err!.errors['passwordHash']).toBeDefined();
    });

    it('does NOT require passwordHash when googleId is set', () => {
      const user = new User({
        email: 'google@example.com',
        name: 'Google User',
        googleId: 'google-id-123',
      });

      const err = user.validateSync();
      expect(err).toBeUndefined();
    });

    it('allows passwordHash + googleId together', () => {
      const user = new User({
        email: 'both@example.com',
        name: 'Both User',
        googleId: 'google-id-456',
        passwordHash: '$2b$12$fakehash',
      });

      const err = user.validateSync();
      expect(err).toBeUndefined();
    });
  });

  describe('tier field', () => {
    it('defaults tier to google', () => {
      const user = new User({
        email: 'tier@example.com',
        name: 'Tier User',
        passwordHash: '$2b$12$fakehash',
      });

      expect(user.tier).toBe('google');
    });

    it('rejects invalid tier values', () => {
      const user = new User({
        email: 'bad@example.com',
        name: 'Bad Tier',
        passwordHash: '$2b$12$fakehash',
        tier: 'premium' as 'google',
      });

      const err = user.validateSync();
      expect(err).toBeDefined();
      expect(err!.errors['tier']).toBeDefined();
    });
  });

  describe('toPublic()', () => {
    it('includes tier and excludes sensitive fields', async () => {
      const user = await User.create({
        email: 'public@example.com',
        name: 'Public User',
        passwordHash: '$2b$12$realhashhere',
        tier: 'google',
        avatarUrl: 'https://example.com/avatar.png',
      });

      const pub = user.toPublic();

      expect(pub.id).toBeDefined();
      expect(pub.email).toBe('public@example.com');
      expect(pub.name).toBe('Public User');
      expect(pub.tier).toBe('google');
      expect(pub.avatarUrl).toBe('https://example.com/avatar.png');
      expect(pub.createdAt).toBeDefined();

      expect((pub as Record<string, unknown>)['passwordHash']).toBeUndefined();
      expect((pub as Record<string, unknown>)['refreshTokens']).toBeUndefined();
    });

    it('treats existing users without tier as google', async () => {
      const user = await User.create({
        email: 'legacy@example.com',
        name: 'Legacy User',
        passwordHash: '$2b$12$legacyhash',
      });

      await User.collection.updateOne(
        { _id: user._id },
        { $unset: { tier: '' } },
      );

      const fetched = await User.findById(user._id);
      const pub = fetched!.toPublic();
      expect(pub.tier).toBe('google');
    });

    it('omits avatarUrl from toPublic when not set', async () => {
      const user = await User.create({
        email: 'noavatar@example.com',
        name: 'No Avatar',
        passwordHash: '$2b$12$hash',
      });

      const pub = user.toPublic();
      expect(pub.avatarUrl).toBeUndefined();
    });
  });

  describe('googleId uniqueness', () => {
    it('enforces unique googleId across users', async () => {
      await User.create({
        email: 'first@example.com',
        name: 'First',
        googleId: 'unique-gid',
      });

      await expect(
        User.create({
          email: 'second@example.com',
          name: 'Second',
          googleId: 'unique-gid',
        }),
      ).rejects.toThrow();
    });

    it('allows multiple users with no googleId (sparse)', async () => {
      await User.create({
        email: 'no-gid-1@example.com',
        name: 'NoGid1',
        passwordHash: '$2b$12$hash1',
      });

      await expect(
        User.create({
          email: 'no-gid-2@example.com',
          name: 'NoGid2',
          passwordHash: '$2b$12$hash2',
        }),
      ).resolves.toBeDefined();
    });
  });
});
