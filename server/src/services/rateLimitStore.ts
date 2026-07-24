import mongoose from 'mongoose';
import type {
  ClientRateLimitInfo,
  Options,
  Store,
} from 'express-rate-limit';

interface RateLimitDocument {
  key: string
  totalHits: number
  resetTime: Date
}

export class MongoRateLimitStore implements Store {
  localKeys = false;

  prefix: string;

  private windowMs = 60_000;

  private indexPromise: Promise<string> | null = null;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const collection = this.collection();
    this.indexPromise ??= collection.createIndex(
      { resetTime: 1 },
      { expireAfterSeconds: 0 },
    );
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
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');
    return db.collection<RateLimitDocument>('rate_limits');
  }
}
