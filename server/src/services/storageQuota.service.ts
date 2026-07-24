import mongoose, { Types } from 'mongoose';
import { User } from '../models/User.js';

export async function reserveStorage(
  userId: string,
  bytes: number,
  maximumBytes: number | undefined,
): Promise<boolean> {
  if (maximumBytes == null) return true;
  const maximumBeforeUpload = maximumBytes - bytes;
  if (maximumBeforeUpload < 0) return false;

  const user = await User.findOneAndUpdate(
    {
      _id: new Types.ObjectId(userId),
      $or: [
        { storageUsedBytes: { $lte: maximumBeforeUpload } },
        { storageUsedBytes: { $exists: false } },
      ],
    },
    { $inc: { storageUsedBytes: bytes } },
    { new: true },
  );
  return user != null;
}

export async function releaseStorage(userId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
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
