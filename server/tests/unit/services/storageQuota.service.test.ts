import { beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MAX_SERVER_FILE_STORAGE_BYTES } from '../../../src/config/limits.js';
import { User } from '../../../src/models/User.js';
import { setupMongoTestDB } from '../../support/setup.js';
import { releaseStorage, reserveStorage } from '../../../src/services/storageQuota.service.js';

setupMongoTestDB();

describe('storage quota reservations', () => {
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      mongoose.connection.db?.collection('storage_usage').deleteMany({}),
    ]);
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

  it('rolls back the user reservation when global storage is full', async () => {
    const user = await User.create({
      email: 'global@example.com',
      name: 'Global Quota User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });
    await mongoose.connection.db?.collection<{ _id: string; bytes: number }>(
      'storage_usage',
    ).insertOne({
      _id: 'gridfs',
      bytes: MAX_SERVER_FILE_STORAGE_BYTES - 10,
    });

    await expect(reserveStorage(user.id, 20, 40)).resolves.toBe(false);
    expect((await User.findById(user.id))?.storageUsedBytes).toBe(0);
  });
});
