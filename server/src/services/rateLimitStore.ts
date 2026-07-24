import mongoose from 'mongoose';
import type {
  ClientRateLimitInfo,
  Options,
  Store,
} from 'express-rate-limit';

interface RateLimitDocument {
  _id?: mongoose.Types.ObjectId
  key: string
  totalHits: number
  resetTime: Date
}

interface DuplicateRateLimitKey {
  _id: string
  keepId: mongoose.Types.ObjectId
  duplicateIds: mongoose.Types.ObjectId[]
  totalHits: number
  resetTime: Date
}

function rateLimitCollection() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  return db.collection<RateLimitDocument>('rate_limits');
}

async function ensureRateLimitIndexes(): Promise<string[]> {
  return rateLimitCollection().createIndexes([
    {
      key: { key: 1 },
      name: 'rate_limit_key_unique',
      unique: true,
    },
    {
      key: { resetTime: 1 },
      expireAfterSeconds: 0,
    },
  ]);
}

export async function initializeRateLimitIndexes(): Promise<void> {
  const collection = rateLimitCollection();
  await collection.deleteMany({ resetTime: { $lte: new Date() } });
  const duplicates = await collection.aggregate<DuplicateRateLimitKey>([
    { $sort: { _id: 1 } },
    {
      $group: {
        _id: '$key',
        keepId: { $first: '$_id' },
        duplicateIds: { $push: '$_id' },
        totalHits: { $sum: '$totalHits' },
        resetTime: { $max: '$resetTime' },
      },
    },
    { $match: { 'duplicateIds.1': { $exists: true } } },
  ]).toArray();

  for (const duplicate of duplicates) {
    await collection.updateOne(
      { _id: duplicate.keepId },
      {
        $set: {
          totalHits: duplicate.totalHits,
          resetTime: duplicate.resetTime,
        },
      },
    );
    await collection.deleteMany({
      _id: { $in: duplicate.duplicateIds.slice(1) },
    });
  }

  await ensureRateLimitIndexes();
}

export class MongoRateLimitStore implements Store {
  localKeys = false;

  prefix: string;

  private windowMs = 60_000;

  private indexPromise: Promise<string[]> | null = null;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const collection = this.collection();
    this.indexPromise ??= ensureRateLimitIndexes();
    await this.indexPromise;
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);
    const document = await collection.findOneAndUpdate(
      { key: `${this.prefix}:${key}` },
      [{
        $set: {
          totalHits: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $type: '$resetTime' }, 'missing'] },
                  { $lte: ['$resetTime', now] },
                ],
              },
              1,
              { $add: [{ $ifNull: ['$totalHits', 0] }, 1] },
            ],
          },
          resetTime: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $type: '$resetTime' }, 'missing'] },
                  { $lte: ['$resetTime', now] },
                ],
              },
              resetTime,
              '$resetTime',
            ],
          },
        },
      }],
      { upsert: true, returnDocument: 'after' },
    );
    if (!document) throw new Error('Could not update authentication rate limit');
    return {
      totalHits: document.totalHits,
      resetTime: document.resetTime,
    };
  }

  async decrement(key: string): Promise<void> {
    await this.collection().updateOne(
      { key: `${this.prefix}:${key}` },
      { $inc: { totalHits: -1 } },
    );
  }

  async resetKey(key: string): Promise<void> {
    await this.collection().deleteOne({ key: `${this.prefix}:${key}` });
  }

  private collection() {
    return rateLimitCollection();
  }
}
