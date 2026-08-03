import { getDB } from './dbCore'
import {
  entityIdFromScopedKey,
  isGuestStorageScope,
  LEGACY_GUEST_STORAGE_SCOPE,
  scopedStorageKey,
} from './storageScope'

const MIGRATED_KEY = 'table-canvas:legacy-guest-migrated'

const STORES = [
  'projects',
  'files',
  'reports',
  'projectSync',
  'projectSyncBase',
] as const

function alreadyMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    return false
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    // Best-effort; a repeat scan is cheap when the legacy partition is empty.
  }
}

/**
 * One-time move of pre-per-tab `guest` IndexedDB records into the claiming tab's
 * `guest:{uuid}` scope. Without this, upgrading users see an empty guest workspace
 * while their old data remains stranded under ownerId `guest`.
 */
/**
 * Never awaited on the login critical path: IndexedDB availability must not
 * gate "Continue as guest" or account sign-in, and any failure here (missing
 * IndexedDB, a blocked open, a stale schema) must never surface to the caller.
 */
export async function migrateLegacyGuestData(targetScope: string): Promise<void> {
  if (!isGuestStorageScope(targetScope) || alreadyMigrated()) return

  try {
    const db = await getDB()
    const tx = db.transaction(STORES, 'readwrite')
    let moved = 0

    for (const name of STORES) {
      const store = tx.objectStore(name)
      let cursor = await store.index('by-owner').openCursor(LEGACY_GUEST_STORAGE_SCOPE)
      while (cursor) {
        const value = cursor.value as {
          id: string
          entityId?: string
          ownerId?: string
        }
        const entityId = value.entityId ?? entityIdFromScopedKey(value.id)
        await store.put({
          ...value,
          id: scopedStorageKey(targetScope, entityId),
          entityId,
          ownerId: targetScope,
        } as never)
        await cursor.delete()
        moved += 1
        cursor = await cursor.continue()
      }
    }
    await tx.done

    markMigrated()
    if (moved > 0) {
      console.info(`[legacyGuestMigration] Moved ${moved} legacy guest record(s) into ${targetScope}`)
    }
  } catch (error) {
    console.warn('[legacyGuestMigration] Could not migrate legacy guest data:', error)
  }
}
