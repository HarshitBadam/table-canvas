import mongoose from 'mongoose';
import type { Options } from 'express-rate-limit';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupMongoTestDB } from '../test/setup.js';
import {
  initializeRateLimitIndexes,
  MongoRateLimitStore,
} from './rateLimitStore.js';

setupMongoTestDB();

const options = { windowMs: 60_000 } as Options;

function store(prefix = 'test') {
  const instance = new MongoRateLimitStore(prefix);
  instance.init(options);
  return instance;
}

describe('Mongo rate-limit store', () => {
  beforeEach(async () => {
    await mongoose.connection.db?.collection('rate_limits').deleteMany({});
  });

  it('counts concurrent first requests in one document', async () => {
    const firstInstance = store();
    const secondInstance = store();

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) => (
        index % 2 === 0 ? firstInstance : secondInstance
      ).increment('client')),
    );

    expect(Math.max(...results.map(result => result.totalHits))).toBe(50);
    expect(await mongoose.connection.db?.collection('rate_limits').countDocuments({
      key: 'test:client',
    })).toBe(1);
  });

  it('merges legacy duplicate counters before creating the unique index', async () => {
    const collection = mongoose.connection.db!.collection('rate_limits');
    await collection.dropIndexes();
    const resetTime = new Date(Date.now() + 60_000);
    await collection.insertMany([
      { key: 'legacy:client', totalHits: 2, resetTime },
      { key: 'legacy:client', totalHits: 3, resetTime },
    ]);

    await initializeRateLimitIndexes();

    const documents = await collection.find({ key: 'legacy:client' }).toArray();
    expect(documents).toHaveLength(1);
    expect(documents[0].totalHits).toBe(5);
    const uniqueIndex = (await collection.indexes())
      .find(index => index.name === 'rate_limit_key_unique');
    expect(uniqueIndex?.unique).toBe(true);
  });
});
