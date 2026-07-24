import { Types } from 'mongoose';
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
