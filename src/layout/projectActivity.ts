const STORAGE_KEY_PREFIX = 'table-canvas:project-activity'
const KEY_SEPARATOR = '\u001f'

function activityStorageKey(scope: string, projectId: string): string {
  return `${STORAGE_KEY_PREFIX}:${scope}${KEY_SEPARATOR}${projectId}`
}

/**
 * Storage is absent in some hosts, throws in others (Safari's private mode
 * rejects writes), and is present but hollow in a few — a `localStorage`
 * object with no methods on it. Every lookup is guarded and the methods are
 * confirmed before use, mirroring workspaceViewPersistence.ts: losing this
 * flag is never worth failing a render, an export, or a sign-in over.
 */
function activityStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage
    if (typeof storage?.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return null
    }
    return storage
  } catch {
    return null
  }
}

/**
 * Flags a project as holding work that only exists in this browser: it has
 * something to undo since it was created, imported, duplicated, or last
 * exported. A blank project, and one whose only edits have all been undone,
 * is never flagged.
 */
export function markProjectActive(scope: string, projectId: string): void {
  const storage = activityStorage()
  if (!storage) return
  try {
    storage.setItem(activityStorageKey(scope, projectId), '1')
  } catch {
    // A missed write only means a later sign-in skips a warning it should show.
  }
}

function isProjectActive(scope: string, projectId: string): boolean {
  const storage = activityStorage()
  if (!storage) return false
  try {
    return storage.getItem(activityStorageKey(scope, projectId)) === '1'
  } catch {
    return false
  }
}

/** A completed export makes the project's current state recoverable elsewhere. */
export function markProjectExported(scope: string, projectId: string): void {
  clearProjectActivity(scope, projectId)
}

export function clearProjectActivity(scope: string, projectId: string): void {
  const storage = activityStorage()
  if (!storage || typeof storage.removeItem !== 'function') return
  try {
    storage.removeItem(activityStorageKey(scope, projectId))
  } catch {
    // Leaving a stale flag behind only costs an extra warning later, never breaks anything.
  }
}

/** True if any of the given projects holds work that has never been exported. */
export function hasUnexportedActivity(scope: string, projectIds: readonly string[]): boolean {
  return projectIds.some(id => isProjectActive(scope, id))
}

/**
 * An explicit sign-out (or leaving guest mode) starts a fresh workspace next
 * time. Its activity flags must not linger and affect an unrelated future
 * guest session that happens to reuse the same scope namespace.
 */
export function clearAllProjectActivity(scope: string): void {
  const storage = activityStorage()
  if (
    !storage
    || typeof storage.removeItem !== 'function'
    || typeof storage.key !== 'function'
    || typeof storage.length !== 'number'
  ) return

  const prefix = `${STORAGE_KEY_PREFIX}:${scope}${KEY_SEPARATOR}`
  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach(key => storage.removeItem(key))
  } catch {
    // Clearing stale flags must never make sign-out fail.
  }
}
