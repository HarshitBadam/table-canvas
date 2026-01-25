/**
 * Seed script to populate MongoDB with test users
 * Run with: npx tsx scripts/seed.ts
 */

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/table-canvas';
const SALT_ROUNDS = 12;

// User schema (simplified for seeding)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  refreshTokens: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);

// Seed data
const seedUsers = [
  {
    email: 'demo@tablecanvas.app',
    password: '1234',
    name: 'Demo User',
  },
];

async function seed() {
  console.log('🌱 Starting database seed...\n');

  try {
    // Connect to MongoDB
    console.log(`📡 Connecting to MongoDB: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clear existing users
    console.log('🗑️  Clearing existing users...');
    await User.deleteMany({});
    console.log('   ✅ Cleared all existing users\n');

    // Seed users
    console.log('👤 Seeding users...');
    for (const userData of seedUsers) {
      const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);
      
      const user = new User({
        email: userData.email.toLowerCase(),
        passwordHash,
        name: userData.name,
        refreshTokens: [],
      });

      await user.save();
      console.log(`   ✅ Created user: ${userData.email}`);
    }

    console.log('\n🎉 Seed completed successfully!');
    console.log('\n📋 Test Credentials:');
    console.log('   Email: demo@tablecanvas.app');
    console.log('   Password: 1234');

  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

seed();
