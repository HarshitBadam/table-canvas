import mongoose from 'mongoose';
import { config } from './env.js';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    console.log('[DB] Already connected to MongoDB');
    return;
  }

  try {
    console.log('[DB] Connecting to MongoDB...');
    
    await mongoose.connect(config.mongodbUri, {
      // Modern mongoose doesn't need most options, they're defaults now
    });

    isConnected = true;
    console.log('[DB] Successfully connected to MongoDB');

    mongoose.connection.on('error', (err) => {
      console.error('[DB] MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[DB] MongoDB reconnected');
      isConnected = true;
    });

  } catch (error) {
    console.error('[DB] Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[DB] Disconnected from MongoDB');
  } catch (error) {
    console.error('[DB] Error disconnecting from MongoDB:', error);
    throw error;
  }
}

export function getConnection(): mongoose.Connection {
  return mongoose.connection;
}
