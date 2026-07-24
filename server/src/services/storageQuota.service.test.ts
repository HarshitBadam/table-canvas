import { beforeEach, describe, expect, it } from 'vitest';
import { User } from '../models/User.js';
import { setupMongoTestDB } from '../test/setup.js';
import { releaseStorage, reserveStorage } from './storageQuota.service.js';

setupMongoTestDB();

describe('storage quota reservations', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('atomically prevents concurrent uploads from exceeding the quota', async () => {
    const user = await User.create({
      email: 'quota@example.com',
      name: 'Quota User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });

    const reservations = await Promise.all([
      reserveStorage(user.id, 30, 40),
      reserveStorage(user.id, 30, 40),
    ]);

    expect(reservations.sort()).toEqual([false, true]);
    expect((await User.findById(user.id))?.storageUsedBytes).toBe(30);
  });

  it('releases reservations without allowing a negative counter', async () => {
    const user = await User.create({
      email: 'release@example.com',
      name: 'Release User',
      passwordHash: 'not-used',
      storageUsedBytes: 10,
    });

    await releaseStorage(user.id, 25);

    expect((await User.findById(user.id))?.storageUsedBytes).toBe(0);
  });
});
