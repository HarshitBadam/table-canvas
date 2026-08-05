import mongoose, { mongo, Types } from 'mongoose';
import { ConflictError } from '../middleware/errorHandler.js';
import { Project } from '../models/Project.js';
import {
  clearPendingFileDelete,
  getFileLifecycleMetadata,
  markFilePendingDelete,
} from './file.service.js';
import { withMongoLease, type HeldMongoLease } from './mongoLease.service.js';
import { deletePendingFileWithQuota } from './storageQuota.service.js';

const USER_LEASE_PREFIX = 'file-lifecycle:';

// How long a file stays tombstoned (metadata.pendingDelete set, hidden from
// reads, bytes not yet reclaimed) before the reaper is allowed to physically
// remove it. This only matters on the rare path where our lease was acquired
// by taking over one that expired: the previous holder may have been a
// writer or deleter that stalled past the lease TTL with a commit still in
// flight. Waiting this long before the irreversible GridFS delete gives that
// stale commit time to either land (and get caught by a final reference
// re-check) or fail outright (its own `assertHeld()` call will lose the
// race once we hold the lease). See `deleteUnreferencedFile` for why this
// is a tombstone/write-claim protocol rather than a pre-write check.
const TAKEOVER_TOMBSTONE_GRACE_MS = 2 * 60 * 1000;

export function fileReferences(nodes: unknown): Set<string> {
  const references = new Set<string>();
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) return references;
  for (const node of Object.values(nodes as Record<string, unknown>)) {
    if (!node || typeof node !== 'object') continue;
    const plan = (node as { plan?: unknown }).plan;
    if (!plan || typeof plan !== 'object') continue;
    const fileRef = (plan as { fileRef?: unknown }).fileRef;
    if (typeof fileRef === 'string') references.add(fileRef);
  }
  return references;
}

export function withUserFileLifecycleLease<T>(
  userId: string,
  work: (lease: HeldMongoLease) => Promise<T>,
): Promise<T> {
  return withMongoLease(`${USER_LEASE_PREFIX}${userId}`, work);
}

export async function assertProjectFilesAvailable(
  userId: string,
  nodes: unknown,
): Promise<void> {
  if (!nodes) return;
  const objectIds = [...fileReferences(nodes)]
    .filter(reference => Types.ObjectId.isValid(reference))
    .map(reference => new mongo.ObjectId(reference));
  if (objectIds.length === 0) return;

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const available = await db.collection('files.files').countDocuments({
    _id: { $in: objectIds },
    'metadata.userId': userId,
    'metadata.pendingDelete': { $exists: false },
  });
  if (available !== objectIds.length) {
    throw new ConflictError(
      'A referenced file is unavailable. Reload the project before saving.',
    );
  }
}

async function activeProjectReferences(userId: string): Promise<Set<string>> {
  const projects = await Project.find({
    userId: new Types.ObjectId(userId),
    deletedAt: null,
  }).select('nodes');
  const references = new Set<string>();
  for (const project of projects) {
    for (const reference of fileReferences(project.nodes)) references.add(reference);
  }
  return references;
}

export async function deleteUnreferencedFile(
  userId: string,
  fileId: string,
): Promise<number | null> {
  return withUserFileLifecycleLease(userId, async lease => {
    const metadata = await getFileLifecycleMetadata(fileId, userId);
    if (!metadata) return null;

    // Scan for references *before* marking pendingDelete: a file that turns
    // out to be referenced is never hidden from reads/downloads at all,
    // instead of being hidden for the duration of the scan and then
    // unhidden. This is safe because project writes and file deletes for a
    // user share the same lease, so nothing can add a reference to this
    // file between the scan and the mark below while we hold it.
    const references = await activeProjectReferences(userId);
    if (references.has(fileId)) {
      throw new ConflictError('File is still referenced by an active project');
    }

    const pendingToken = lease.owner;
    const marked = await markFilePendingDelete(fileId, userId, pendingToken);
    if (!marked) return null;

    try {
      await lease.assertHeld();
      if (lease.tookOverExpiredLease) {
        // We just took this lease over from an expired holder. That
        // previous holder could have been a project writer or another
        // deleter whose commit is still in flight (e.g. a slow network
        // round trip) even though it will fail its own `assertHeld()`
        // once it resumes. Rather than racing a hard delete against that
        // possible in-flight write -- which could leave a project pointing
        // at bytes we just removed -- leave the file tombstoned. The
        // reaper below re-checks references after a grace period and
        // either finishes the delete or heals the tombstone if a
        // reference shows up in the meantime. This favors the file being
        // temporarily unavailable over a permanently dangling reference.
        return metadata.size;
      }
      return await deletePendingFileWithQuota(fileId, userId, pendingToken);
    } catch (error) {
      await clearPendingFileDelete(fileId, userId, pendingToken);
      throw error;
    }
  });
}

/**
 * Physically deletes files left tombstoned (`metadata.pendingDelete` set)
 * once they are unreferenced and at least `graceMs` old, restoring any
 * tombstone that turns out to reference an active project. Called with no
 * grace period at startup (nothing from a previous process can still be
 * in flight), and periodically at runtime with a grace period to give a
 * stale writer's in-flight commit (see `deleteUnreferencedFile`) a chance
 * to either land -- and be healed here -- or fail on its own.
 */
export async function reapPendingFileDeletes(graceMs = 0): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');
  const cutoff = new Date(Date.now() - graceMs);
  const pendingUsers = await db.collection('files.files').distinct<string>(
    'metadata.userId',
    {
      'metadata.pendingDelete.token': { $type: 'string' },
      'metadata.pendingDelete.markedAt': { $lte: cutoff },
    },
  );

  for (const userId of pendingUsers) {
    await withUserFileLifecycleLease(userId, async lease => {
      const references = await activeProjectReferences(userId);
      const pendingFiles = await db.collection('files.files').find({
        'metadata.userId': userId,
        'metadata.pendingDelete.token': { $type: 'string' },
        'metadata.pendingDelete.markedAt': { $lte: cutoff },
      }, {
        projection: {
          _id: 1,
          length: 1,
          'metadata.pendingDelete.token': 1,
        },
      }).toArray();

      for (const file of pendingFiles) {
        const fileId = file._id.toString();
        const token = file.metadata?.pendingDelete?.token;
        if (typeof token !== 'string') continue;
        if (references.has(fileId)) {
          await clearPendingFileDelete(fileId, userId, token);
          continue;
        }
        try {
          await lease.assertHeld();
          await deletePendingFileWithQuota(fileId, userId, token);
        } catch (error) {
          console.error(`[FileLifecycle] Failed to reap pending delete for ${fileId}:`, error);
        }
      }
    });
  }
}

export async function recoverPendingFileDeletes(): Promise<void> {
  await reapPendingFileDeletes(0);
}

export function startPendingFileDeleteReaper(
  intervalMs = 60_000,
  graceMs = TAKEOVER_TOMBSTONE_GRACE_MS,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    void reapPendingFileDeletes(graceMs).catch((error: unknown) => {
      console.error('[FileLifecycle] Pending delete reaper failed:', error);
    });
  }, intervalMs);
  timer.unref();
  return timer;
}
