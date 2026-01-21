/**
 * Test Setup
 * 
 * Configures MongoMemoryServer for integration tests.
 * Provides global setup and teardown for all test files.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

let mongoServer: MongoMemoryServer | null = null;

/**
 * Start MongoMemoryServer and connect Mongoose before all tests
 */
beforeAll(async () => {
  // Create in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'test_db',
    },
  });

  const uri = mongoServer.getUri();

  // Connect Mongoose to in-memory database
  await mongoose.connect(uri);
  
  console.log('[Test Setup] Connected to in-memory MongoDB');
});

/**
 * Clear all collections after each test to ensure isolation
 */
afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
});

/**
 * Disconnect and stop MongoMemoryServer after all tests
 */
afterAll(async () => {
  // Disconnect Mongoose
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Stop MongoMemoryServer
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }

  console.log('[Test Setup] Disconnected from in-memory MongoDB');
});

/**
 * Export for manual control in specific test files if needed
 */
export { mongoServer };
