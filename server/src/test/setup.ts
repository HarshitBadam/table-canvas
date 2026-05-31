// vitest setupFiles do not reliably fire beforeAll/afterAll hooks with pool: 'forks'.
// This module is therefore imported directly by test files.

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

let mongoServer: MongoMemoryServer | null = null;
let refCount = 0;

export function setupMongoTestDB() {
  beforeAll(async () => {
    refCount++;
    if (!mongoServer) {
      mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'test_db' },
      });
      await mongoose.connect(mongoServer.getUri());
    } else if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoServer.getUri());
    }
  }, 30000);

  afterEach(async () => {
    if (mongoose.connection.readyState === 1) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    }
  });

  afterAll(async () => {
    refCount--;
    if (refCount <= 0) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      if (mongoServer) {
        await mongoServer.stop();
        mongoServer = null;
      }
    }
  });
}
