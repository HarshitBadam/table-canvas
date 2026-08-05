import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MAX_SERVER_FILE_STORAGE_BYTES } from '../../../src/config/limits.js';
import { User } from '../../../src/models/User.js';
import { setupMongoTestDB } from '../../support/setup.js';
import {
  cancelStorageReservation,
  completeStorageReservation,
  reconcileStorageUsage,
  reserveStorage,
} from '../../../src/services/storageQuota.service.js';

setupMongoTestDB();

describe('storage quota reservations', () => {
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      mongoose.connection.db?.collection('storage_usage').deleteMany({}),
      mongoose.connection.db?.collection('storage_reservations').deleteMany({}),
      mongoose.connection.db?.collection('files.files').deleteMany({}),
      mongoose.connection.db?.collection('operation_leases').deleteMany({}),
    ]);
    vi.restoreAllMocks();
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

    expect(reservations.filter(Boolean)).toHaveLength(1);
    expect(reservations.filter(value => value == null)).toHaveLength(1);
    expect((await User.findById(user.id))?.storageUsedBytes).toBe(30);
  });

  it('cancels a durable reservation and restores counters', async () => {
    const user = await User.create({
      email: 'release@example.com',
      name: 'Release User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });
    const reservationId = await reserveStorage(user.id, 10, 40);
    expect(reservationId).toEqual(expect.any(String));

    await cancelStorageReservation(reservationId!);

    expect((await User.findById(user.id))?.storageUsedBytes).toBe(0);
  });

  it('rolls back the user reservation when global storage is full', async () => {
    const user = await User.create({
      email: 'global@example.com',
      name: 'Global Quota User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });
    await mongoose.connection.db?.collection('files.files').insertOne({
      _id: new mongoose.Types.ObjectId(),
      filename: 'nearly-full.bin',
      length: MAX_SERVER_FILE_STORAGE_BYTES - 10,
      uploadDate: new Date(),
      metadata: { userId: new mongoose.Types.ObjectId().toString() },
    });
    await reconcileStorageUsage();

    await expect(reserveStorage(user.id, 20, 40)).resolves.toBeNull();
    expect((await User.findById(user.id))?.storageUsedBytes).toBe(0);
  });

  it('keeps reserve, complete, and cancel on incremental hot paths', async () => {
    const user = await User.create({
      email: 'incremental@example.com',
      name: 'Incremental User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });
    const files = mongoose.connection.db!.collection('files.files');
    const bulkWrite = vi.spyOn(User, 'bulkWrite');

    const committedReservation = await reserveStorage(user.id, 10, 40);
    await files.insertOne({
      _id: new mongoose.Types.ObjectId(),
      filename: 'committed.csv',
      length: 10,
      uploadDate: new Date(),
      metadata: {
        userId: user.id,
        storageReservationId: committedReservation,
      },
    });
    await completeStorageReservation(committedReservation!);
    const cancelledReservation = await reserveStorage(user.id, 5, 40);
    await cancelStorageReservation(cancelledReservation!);

    expect(bulkWrite).not.toHaveBeenCalled();
    expect((await User.findById(user.id))?.storageUsedBytes).toBe(10);
    expect(await mongoose.connection.db
      ?.collection<{ _id: string; bytes: number }>('storage_usage')
      .findOne({ _id: 'gridfs' })).toMatchObject({ bytes: 10 });
  });

  it('repairs delete counter drift when taking over an expired lease', async () => {
    const user = await User.create({
      email: 'takeover@example.com',
      name: 'Takeover User',
      passwordHash: 'not-used',
      storageUsedBytes: 30,
    });
    await mongoose.connection.db
      ?.collection<{ _id: string; bytes: number }>('storage_usage').insertOne({
      _id: 'gridfs',
      bytes: 30,
    });
    await mongoose.connection.db?.collection<{
      _id: string;
      owner: string;
      expiresAt: Date;
    }>('operation_leases').insertOne({
      _id: 'storage-quota',
      owner: 'crashed-instance',
      expiresAt: new Date(Date.now() - 1_000),
    });
    const bulkWrite = vi.spyOn(User, 'bulkWrite');

    const reservationId = await reserveStorage(user.id, 5, 40);

    expect(reservationId).toEqual(expect.any(String));
    expect(bulkWrite).toHaveBeenCalledOnce();
    expect((await User.findById(user.id))?.storageUsedBytes).toBe(5);
    expect(await mongoose.connection.db
      ?.collection<{ _id: string; bytes: number }>('storage_usage')
      .findOne({ _id: 'gridfs' })).toMatchObject({ bytes: 5 });
  });

  it('reconciliation includes a live in-flight reservation', async () => {
    const user = await User.create({
      email: 'live@example.com',
      name: 'Live Reservation User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });
    const reservationId = await reserveStorage(user.id, 30, 40);
    await User.updateOne({ _id: user._id }, { $set: { storageUsedBytes: 0 } });

    await reconcileStorageUsage();

    expect((await User.findById(user.id))?.storageUsedBytes).toBe(30);
    expect(await mongoose.connection.db
      ?.collection<{ _id: string }>('storage_reservations')
      .findOne({ _id: reservationId! })).not.toBeNull();
  });

  it('counts committed GridFS bytes once and compacts their reservation', async () => {
    const user = await User.create({
      email: 'committed@example.com',
      name: 'Committed User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });
    const reservationId = await reserveStorage(user.id, 30, 40);
    await mongoose.connection.db?.collection('files.files').insertOne({
      _id: new mongoose.Types.ObjectId(),
      filename: 'committed.csv',
      length: 30,
      uploadDate: new Date(),
      metadata: {
        userId: user.id,
        storageReservationId: reservationId,
      },
    });

    await reconcileStorageUsage();

    expect((await User.findById(user.id))?.storageUsedBytes).toBe(30);
    expect(await mongoose.connection.db
      ?.collection<{ _id: string }>('storage_reservations')
      .findOne({ _id: reservationId! })).toBeNull();
  });

  it('serializes startup reconciliation with a new reservation', async () => {
    const user = await User.create({
      email: 'startup@example.com',
      name: 'Startup User',
      passwordHash: 'not-used',
      storageUsedBytes: 0,
    });

    const [, reservationId] = await Promise.all([
      reconcileStorageUsage(),
      reserveStorage(user.id, 30, 40),
    ]);

    expect(reservationId).toEqual(expect.any(String));
    expect((await User.findById(user.id))?.storageUsedBytes).toBe(30);
  });
});
