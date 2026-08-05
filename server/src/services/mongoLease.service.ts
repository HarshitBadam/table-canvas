import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

const LEASE_COLLECTION = 'operation_leases';

interface LeaseDocument {
  _id: string;
  owner: string;
  expiresAt: Date;
  fence: number;
}

interface LeaseOptions {
  ttlMs?: number;
  waitMs?: number;
}

export interface HeldMongoLease {
  owner: string;
  /**
   * Monotonically increasing generation number for this lease key. It is
   * bumped on every acquisition (fresh insert or takeover of an expired
   * lease), so a caller can tell whether it is the same generation that
   * originally observed some state, or record the generation something was
   * decided under for later auditing/tests. It is not a substitute for a
   * cross-collection transaction: two round trips (a fence read and a later
   * write) can never be perfectly atomic against another collection without
   * multi-document transactions, which this deployment does not have.
   */
  fence: number;
  tookOverExpiredLease: boolean;
  assertHeld(): Promise<void>;
  abandon(): void;
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 11000,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withMongoLease<T>(
  key: string,
  work: (lease: HeldMongoLease) => Promise<T>,
  options: LeaseOptions = {},
): Promise<T> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const collection = db.collection<LeaseDocument>(LEASE_COLLECTION);
  const owner = randomUUID();
  const ttlMs = options.ttlMs ?? 30_000;
  const deadline = Date.now() + (options.waitMs ?? 15_000);
  let tookOverExpiredLease = false;
  let fence = 0;

  while (true) {
    const now = new Date();
    try {
      const expired = await collection.findOneAndUpdate(
        {
          _id: key,
          expiresAt: { $lte: now },
        },
        {
          $set: {
            owner,
            expiresAt: new Date(now.getTime() + ttlMs),
          },
          $inc: { fence: 1 },
        },
        {
          returnDocument: 'after',
        },
      );
      if (expired) {
        tookOverExpiredLease = true;
        fence = expired.fence;
        break;
      }
      await collection.insertOne({
        _id: key,
        owner,
        expiresAt: new Date(now.getTime() + ttlMs),
        fence: 1,
      });
      fence = 1;
      break;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for operation lease: ${key}`);
    }
    await delay(25);
  }

  let stopped = false;
  let lost = false;
  let abandoned = false;
  let heartbeat: NodeJS.Timeout | undefined;
  const renew = async (): Promise<boolean> => {
    const result = await collection.updateOne(
      { _id: key, owner },
      { $set: { expiresAt: new Date(Date.now() + ttlMs) } },
    );
    return result.matchedCount === 1;
  };
  const scheduleHeartbeat = (): void => {
    heartbeat = setTimeout(async () => {
      if (stopped) return;
      try {
        lost = !(await renew());
      } catch {
        lost = true;
      }
      if (!lost) scheduleHeartbeat();
    }, Math.max(100, Math.floor(ttlMs / 3)));
    heartbeat.unref();
  };
  scheduleHeartbeat();

  const lease: HeldMongoLease = {
    owner,
    fence,
    tookOverExpiredLease,
    async assertHeld() {
      if (lost || !(await renew())) {
        lost = true;
        throw new Error(`Operation lease was lost: ${key}`);
      }
    },
    abandon() {
      abandoned = true;
    },
  };

  try {
    return await work(lease);
  } finally {
    stopped = true;
    if (heartbeat) clearTimeout(heartbeat);
    if (!abandoned) await collection.deleteOne({ _id: key, owner });
  }
}
