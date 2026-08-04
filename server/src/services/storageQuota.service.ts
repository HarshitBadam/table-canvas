import mongoose, { Types } from 'mongoose';
import { MAX_SERVER_FILE_STORAGE_BYTES } from '../config/limits.js';
import { User } from '../models/User.js';

const STORAGE_USAGE_COLLECTION = 'storage_usage';
const GRIDFS_USAGE_ID = 'gridfs';

interface StorageUsage {
  _id: string;
  bytes: number;
}

async function reserveUserStorage(
  userId: string,
  bytes: number,
  maximumBytes: number | undefined,
): Promise<boolean> {
  const filter: Record<string, unknown> = {
    _id: new Types.ObjectId(userId),
  };
  if (maximumBytes != null) {
    const maximumBeforeUpload = maximumBytes - bytes;
    if (maximumBeforeUpload < 0) return false;
    filter.$or = [
      { storageUsedBytes: { $lte: maximumBeforeUpload } },
      { storageUsedBytes: { $exists: false } },
    ];
  }
  const user = await User.findOneAndUpdate(
    filter,
    { $inc: { storageUsedBytes: bytes } },
    { new: true },
  );
  return user != null;
}

async function reserveGlobalStorage(bytes: number): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const collection = db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION);
  await collection.updateOne(
    { _id: GRIDFS_USAGE_ID },
    { $setOnInsert: { bytes: 0 } },
    { upsert: true },
  );
  const maximumBeforeUpload = MAX_SERVER_FILE_STORAGE_BYTES - bytes;
  if (maximumBeforeUpload < 0) return false;
  const usage = await collection.findOneAndUpdate(
    {
      _id: GRIDFS_USAGE_ID,
      bytes: { $lte: maximumBeforeUpload },
    },
    { $inc: { bytes } },
    { returnDocument: 'after' },
  );
  return usage != null;
}

async function releaseUserStorage(userId: string, bytes: number): Promise<void> {
  await User.updateOne(
    { _id: new Types.ObjectId(userId) },
    [
      {
        $set: {
          storageUsedBytes: {
            $max: [0, { $subtract: [{ $ifNull: ['$storageUsedBytes', 0] }, bytes] }],
          },
        },
      },
    ],
  );
}

async function releaseGlobalStorage(bytes: number): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  await db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION).updateOne(
    { _id: GRIDFS_USAGE_ID },
    [
      {
        $set: {
          bytes: {
            $max: [0, { $subtract: [{ $ifNull: ['$bytes', 0] }, bytes] }],
          },
        },
      },
    ],
    { upsert: true },
  );
}

export async function reserveStorage(
  userId: string,
  bytes: number,
  maximumBytes: number | undefined,
): Promise<boolean> {
  const userReserved = await reserveUserStorage(userId, bytes, maximumBytes);
  if (!userReserved) return false;
  try {
    const globalReserved = await reserveGlobalStorage(bytes);
    if (globalReserved) return true;
    await releaseUserStorage(userId, bytes);
    return false;
  } catch (error) {
    await releaseUserStorage(userId, bytes);
    throw error;
  }
}

export async function releaseStorage(userId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  await Promise.all([
    releaseUserStorage(userId, bytes),
    releaseGlobalStorage(bytes),
  ]);
}

export async function reconcileStorageUsage(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const usage = await db.collection('files.files').aggregate<{
    _id: string
    bytes: number
  }>([
    { $match: { 'metadata.userId': { $type: 'string' } } },
    { $group: { _id: '$metadata.userId', bytes: { $sum: '$length' } } },
  ]).toArray();

  const totalBytes = usage.reduce((total, item) => total + item.bytes, 0);
  await db.collection<StorageUsage>(STORAGE_USAGE_COLLECTION).updateOne(
    { _id: GRIDFS_USAGE_ID },
    { $set: { bytes: totalBytes } },
    { upsert: true },
  );
  await User.updateMany({}, { $set: { storageUsedBytes: 0 } });
  if (usage.length === 0) return;
  await User.bulkWrite(usage
    .filter(item => Types.ObjectId.isValid(item._id))
    .map(item => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(item._id) },
        update: { $set: { storageUsedBytes: item.bytes } },
      },
    })));
}
