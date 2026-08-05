import { randomUUID } from 'crypto';
import mongoose, { Types } from 'mongoose';
import { MAX_SERVER_FILE_STORAGE_BYTES } from '../config/limits.js';
import { User } from '../models/User.js';
import { deletePendingFile } from './file.service.js';
import { withMongoLease } from './mongoLease.service.js';

const STORAGE_USAGE_COLLECTION = 'storage_usage';
const STORAGE_RESERVATION_COLLECTION = 'storage_reservations';
const GRIDFS_USAGE_ID = 'gridfs';
const QUOTA_LEASE_KEY = 'storage-quota';
const QUOTA_LEASE_TTL_MS = 30_000;
const RESERVATION_TTL_MS = 15 * 60 * 1000;
// Bounded so reaping stays a small, ~constant amount of work per call
// instead of scanning the whole reservations collection on every hot-path
// operation.
const RESERVATION_REAP_BATCH = 10;

interface StorageUsage {
  _id: string;
  bytes: number;
  // Bumped by every counter mutation (both the incremental $inc path and
  // full reconciliation). Reconciliation captures this value before it
  // starts computing a fresh snapshot and only commits its result if the
  // version is unchanged, so a reconciliation left running by a stale lease
  // holder past the lease TTL can never clobber counters touched by
  // whoever holds the lease now -- it just no-ops and leaves the live
  // counters alone. This is a single-document CAS, not a second pre-write
  // check: the version-gated write is the only write, and it either lands
  // atomically or doesn't.
  version: number;
}

interface StorageReservation {
  _id: string;
  userId: string;
  bytes: number;
  createdAt: Date;
  expiresAt: Date;
  state?: 'reserved' | 'cancelling';
}

interface UsageSnapshot {
  totalBytes: number;
  byUser: Map<string, number>;
}

interface GridFsUsageSnapshot {
  byUser: Array<{ _id: string; bytes: number }>;
  reservationIds: Array<{ _id: null; ids: string[] }>;
}

async function authoritativeUsage(now: Date): Promise<UsageSnapshot> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const [gridFs = { byUser: [], reservationIds: [] }] = await db
    .collection('files.files')
    .aggregate<GridFsUsageSnapshot>([
      { $match: { 'metadata.userId': { $type: 'string' } } },
      {
        $facet: {
          byUser: [
            { $group: { _id: '$metadata.userId', bytes: { $sum: '$length' } } },
          ],
          reservationIds: [
            { $match: { 'metadata.storageReservationId': { $type: 'string' } } },
            {
              $group: {
                _id: null,
                ids: { $addToSet: '$metadata.storageReservationId' },
              },
            },
          ],
        },
      },
    ])
    .toArray();

  const representedReservations = new Set(
    gridFs.reservationIds[0]?.ids ?? [],
  );
  const reservations = await db
    .collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION)
    .find({
      expiresAt: { $gt: now },
      state: { $ne: 'cancelling' },
    })
    .toArray();
  const byUser = new Map(
    gridFs.byUser.map(item => [item._id, item.bytes]),
  );
  for (const reservation of reservations) {
    if (representedReservations.has(reservation._id)) continue;
    byUser.set(
      reservation.userId,
      (byUser.get(reservation.userId) ?? 0) + reservation.bytes,
    );
  }

  await db.collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION).deleteMany({
    $or: [
      { expiresAt: { $lte: now } },
      { state: 'cancelling' },
      { _id: { $in: [...representedReservations] } },
    ],
  });
  return {
    byUser,
    totalBytes: [...byUser.values()].reduce((sum, bytes) => sum + bytes, 0),
  };
}

async function currentUsageVersion(): Promise<number> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const doc = await db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION).findOneAndUpdate(
    { _id: GRIDFS_USAGE_ID },
    [{
      $set: {
        bytes: { $ifNull: ['$bytes', 0] },
        version: { $ifNull: ['$version', 0] },
      },
    }],
    { upsert: true, returnDocument: 'after' },
  );
  return doc?.version ?? 0;
}

/**
 * Applies a full-recompute snapshot, but only if nothing has bumped the
 * global usage version since `expectedVersion` was captured (i.e. since the
 * snapshot started being computed). Returns false, and applies nothing, if
 * the version has moved: that means a reservation, completion, cancellation,
 * or delete landed while we were computing, and our snapshot is stale
 * relative to it. Skipping is safe -- reconciliation is a periodic,
 * self-healing correction of drift, and a subsequent run will pick up
 * whatever changed -- overwriting would not be, because it could erase a
 * counter change that is newer than our snapshot.
 */
async function writeUsageCounters(
  snapshot: UsageSnapshot,
  expectedVersion: number,
): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const claimed = await db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION).findOneAndUpdate(
    { _id: GRIDFS_USAGE_ID, version: expectedVersion },
    { $set: { bytes: snapshot.totalBytes, version: expectedVersion + 1 } },
  );
  if (!claimed) return false;

  const users = await User.find().select('_id').lean();
  if (users.length > 0) {
    await User.bulkWrite(users.map(user => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            storageUsedBytes: snapshot.byUser.get(user._id.toString()) ?? 0,
          },
        },
      },
    })));
  }
  return true;
}

async function reconcileWhileLeased(): Promise<UsageSnapshot> {
  const expectedVersion = await currentUsageVersion();
  const snapshot = await authoritativeUsage(new Date());
  const applied = await writeUsageCounters(snapshot, expectedVersion);
  if (!applied) {
    console.warn(
      '[StorageQuota] Skipped a stale reconciliation: counters changed while the snapshot was computed.',
    );
  }
  return snapshot;
}

async function withQuotaLease<T>(
  work: () => Promise<T>,
  reconcileOnTakeover = true,
): Promise<T> {
  return withMongoLease(QUOTA_LEASE_KEY, async lease => {
    try {
      if (reconcileOnTakeover && lease.tookOverExpiredLease) {
        await reconcileWhileLeased();
      }
      await reapExpiredReservations(new Date());
      return await work();
    } catch (error) {
      // Unknown partial writes must force the next owner through reconciliation.
      lease.abandon();
      throw error;
    }
  }, {
    ttlMs: QUOTA_LEASE_TTL_MS,
    waitMs: QUOTA_LEASE_TTL_MS + 5_000,
  });
}

async function adjustUsageCounters(userId: string, bytes: number): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  if (bytes >= 0) {
    await User.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $inc: { storageUsedBytes: bytes } },
    );
    await db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION).updateOne(
      { _id: GRIDFS_USAGE_ID },
      { $inc: { bytes, version: 1 } },
      { upsert: true },
    );
    return;
  }

  await User.updateOne(
    { _id: new Types.ObjectId(userId) },
    [{
      $set: {
        storageUsedBytes: {
          $max: [0, { $add: [{ $ifNull: ['$storageUsedBytes', 0] }, bytes] }],
        },
      },
    }],
  );
  await db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION).updateOne(
    { _id: GRIDFS_USAGE_ID },
    [{
      $set: {
        bytes: {
          $max: [0, { $add: [{ $ifNull: ['$bytes', 0] }, bytes] }],
        },
        version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
      },
    }],
    { upsert: true },
  );
}

export async function initializeStorageQuotaIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  await db.collection(STORAGE_RESERVATION_COLLECTION).createIndex({ expiresAt: 1 });
  await db.collection('files.files').createIndex({ 'metadata.storageReservationId': 1 });
}

/**
 * Releases the reserved bytes for a small, indexed batch of reservations
 * that expired without ever being completed or cancelled (e.g. the client
 * abandoned the upload). This is bounded and indexed so it stays cheap
 * enough to run on every quota-lease acquisition, which is what lets
 * inflated counters recover incrementally instead of only at the next
 * lease-takeover or process restart. A reservation whose bytes are already
 * represented by a GridFS file (the upload actually finished but
 * `completeStorageReservation` never ran, e.g. the process crashed in
 * between) is only removed, never double-released, since those bytes are
 * already counted once via the earlier `reserveStorage` increment.
 */
async function reapExpiredReservations(now: Date): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const expired = await db
    .collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION)
    .find({ expiresAt: { $lte: now } })
    .limit(RESERVATION_REAP_BATCH)
    .toArray();
  if (expired.length === 0) return;

  const represented = new Set(
    await db.collection('files.files').distinct('metadata.storageReservationId', {
      'metadata.storageReservationId': { $in: expired.map(reservation => reservation._id) },
    }),
  );

  for (const reservation of expired) {
    if (!represented.has(reservation._id)) {
      await adjustUsageCounters(reservation.userId, -reservation.bytes);
    }
    await db.collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION)
      .deleteOne({ _id: reservation._id });
  }
}

export async function reserveStorage(
  userId: string,
  bytes: number,
  maximumBytes: number | undefined,
): Promise<string | null> {
  if (bytes <= 0) throw new Error('Storage reservation bytes must be positive');
  return withQuotaLease(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');
    const [user, globalUsage] = await Promise.all([
      User.findById(userId).select('storageUsedBytes').lean(),
      db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION).findOneAndUpdate(
        { _id: GRIDFS_USAGE_ID },
        { $setOnInsert: { bytes: 0 } },
        { upsert: true, returnDocument: 'after' },
      ),
    ]);
    if (!user) return null;
    const userBytes = user.storageUsedBytes ?? 0;
    const totalBytes = globalUsage?.bytes ?? 0;
    if (
      totalBytes + bytes > MAX_SERVER_FILE_STORAGE_BYTES
      || (maximumBytes != null && userBytes + bytes > maximumBytes)
    ) {
      return null;
    }

    const reservationId = randomUUID();
    const now = new Date();
    await db.collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION).insertOne({
      _id: reservationId,
      userId,
      bytes,
      createdAt: now,
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      state: 'reserved',
    });
    await adjustUsageCounters(userId, bytes);
    return reservationId;
  });
}

export async function completeStorageReservation(
  reservationId: string,
): Promise<void> {
  await withQuotaLease(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');
    await db.collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION)
      .deleteOne({ _id: reservationId });
  });
}

export async function cancelStorageReservation(
  reservationId: string,
): Promise<void> {
  await withQuotaLease(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');
    const reservation = await db
      .collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION)
      .findOneAndUpdate(
        {
          _id: reservationId,
          state: { $ne: 'cancelling' },
        },
        { $set: { state: 'cancelling' } },
        { returnDocument: 'before' },
      );
    if (!reservation) return;
    await adjustUsageCounters(reservation.userId, -reservation.bytes);
    await db.collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION)
      .deleteOne({ _id: reservationId, state: 'cancelling' });
  });
}

export async function renewStorageReservation(
  reservationId: string,
): Promise<void> {
  await withQuotaLease(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');
    await db.collection<StorageReservation>(STORAGE_RESERVATION_COLLECTION).updateOne(
      { _id: reservationId, state: { $ne: 'cancelling' } },
      { $set: { expiresAt: new Date(Date.now() + RESERVATION_TTL_MS) } },
    );
  });
}

export async function deletePendingFileWithQuota(
  fileId: string,
  userId: string,
  pendingToken: string,
): Promise<number | null> {
  return withQuotaLease(async () => {
    const deletedBytes = await deletePendingFile(fileId, userId, pendingToken);
    if (deletedBytes == null) return null;
    await adjustUsageCounters(userId, -deletedBytes);
    return deletedBytes;
  });
}

export async function reconcileStorageUsage(): Promise<void> {
  await withQuotaLease(async () => {
    await reconcileWhileLeased();
  }, false);
}
