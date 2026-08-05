import {
  documentLeaseName,
  documentOpenLockName,
  documentTabId,
} from './documentIdentity'
import {
  hasOpenDocumentPeer,
  openDocumentPresenceChannel,
} from './documentPresence'
import {
  clearMirrorRetry,
  createMirrorRetry,
  resetMirrorRetry,
  scheduleMirrorRetry,
  type MirrorRetry,
} from './documentLeaseRetry'
import type { DeleteGuardResult } from './documentDeleteGuard'
import { canDeleteFromSnapshot } from './documentDeleteProbe'

export { withInactiveDocumentDeleteGuard } from './documentDeleteGuard'

/**
 * Exactly one tab per document may write it. Ownership is only ever established by
 * actually holding the Web Lock. Readers remain queued and are promoted only when the
 * browser releases the current owner's lock.
 */
export type LeaseRole = 'acquiring' | 'owner' | 'mirror'

export interface LeaseState {
  role: LeaseRole
}

interface LeaseSession {
  key: string
  tabId: string
  presenceChannel: BroadcastChannel | null
  abort: AbortController | null
  releaseLock: (() => void) | null
  releaseOpen: (() => void) | null
  openAbort: AbortController | null
  openTask: Promise<void> | null
  stopped: boolean
  /** True once another tab has owned the document while this one watched. */
  mirrored: boolean
  /** Backoff for retrying a failed mirror-promotion without spinning. */
  retry: MirrorRetry
}

export interface LeaseSessionOptions {
  key: string
  /** Runs when a mirror becomes the owner, before writes are re-enabled. */
  onPromoted?: () => Promise<void> | void
}

const IDLE_STATE: LeaseState = {
  role: 'acquiring',
}

let session: LeaseSession | null = null
let options: LeaseSessionOptions | null = null
let state: LeaseState = IDLE_STATE
const listeners = new Set<() => void>()

function openPresenceChannel(active: LeaseSession): void {
  active.presenceChannel = openDocumentPresenceChannel(active.key, active.tabId)
}

function emit(next: Partial<LeaseState>): void {
  const merged = { ...state, ...next }
  if (merged.role === state.role) return
  state = merged
  for (const listener of listeners) listener()
}

export function getLeaseState(): LeaseState {
  return state
}

export function subscribeLease(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasDocumentLease(): boolean {
  return session !== null
}

/** With a key, ownership must belong to that exact document. */
export function holdsWriteLease(key?: string): boolean {
  if (!session) return key === undefined
  return state.role === 'owner' && (key === undefined || session.key === key)
}

function releaseLock(active: LeaseSession): void {
  const resolve = active.releaseLock
  active.releaseLock = null
  resolve?.()
}

function releaseOpen(active: LeaseSession): void {
  const resolve = active.releaseOpen
  active.releaseOpen = null
  resolve?.()
  active.openAbort?.abort()
  active.openAbort = null
}

async function holdOpenPresence(active: LeaseSession): Promise<void> {
  const locks = navigator.locks
  if (!locks) return
  const controller = new AbortController()
  active.openAbort = controller
  try {
    await locks.request(
      documentOpenLockName(active.key),
      { mode: 'shared', signal: controller.signal },
      async lock => {
        if (!lock || active.stopped) return
        await new Promise<void>((resolve) => {
          active.releaseOpen = resolve
        })
      },
    )
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError' || active.stopped) return
    console.warn('[DocumentLease] Could not take the open-presence lock:', error)
  } finally {
    if (active.openAbort === controller) active.openAbort = null
  }
}

function startOpenPresence(active: LeaseSession): void {
  if (active.stopped || active.openTask) return
  const task = holdOpenPresence(active)
  active.openTask = task
  void task.finally(() => {
    if (active.openTask === task) active.openTask = null
  })
}

async function holdUntilReleased(active: LeaseSession): Promise<void> {
  await new Promise<void>((resolve) => {
    active.releaseLock = resolve
  })
}

async function hold(active: LeaseSession, lock: Lock | null): Promise<void> {
  if (active.stopped || !lock) return
  if (active.mirrored) {
    try {
      await options?.onPromoted?.()
    } catch (error) {
      // Failed durable adoption must never enable edits or persistence, but it
      // also must not strand the exclusive lock: release it (role stays
      // 'mirror', no new visible UI state) and retry later on a backoff so
      // this tab can still recover ownership without blocking every tab.
      console.error('[DocumentLease] Could not refresh before editing here:', error)
      scheduleMirrorRetry(active.retry, () => {
        if (active.stopped) return
        void requestMirrorLock(active)
      })
      return
    }
  }
  resetMirrorRetry(active.retry)
  if (active.stopped) return
  emit({ role: 'owner' })
  await holdUntilReleased(active)
}

async function requestMirrorLock(active: LeaseSession): Promise<void> {
  const locks = navigator.locks
  if (!locks || active.stopped) return
  active.abort = new AbortController()
  try {
    await locks.request(
      documentLeaseName(active.key),
      { mode: 'exclusive', signal: active.abort.signal },
      lock => hold(active, lock),
    )
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError' || active.stopped) return
    console.error('[DocumentLease] Could not take the write lease:', error)
  }
}

async function acquire(active: LeaseSession): Promise<void> {
  const locks = navigator.locks
  if (!locks) {
    // Every browser the app supports has Web Locks. Assume a single tab rather than
    // blocking the workspace, which would turn a capability gap into data loss.
    console.warn('[DocumentLease] Web Locks unavailable; assuming this is the only tab.')
    emit({ role: 'owner' })
    return
  }
  active.abort = new AbortController()
  try {
    let acquiredImmediately = false
    await locks.request(
      documentLeaseName(active.key),
      // `ifAvailable` requests settle immediately and Web Locks forbids pairing
      // that option with `signal`. The queued request below remains abortable.
      { mode: 'exclusive', ifAvailable: true },
      async lock => {
        if (!lock) return
        acquiredImmediately = true
        await hold(active, lock)
      },
    )
    if (acquiredImmediately || active.stopped) return
    active.mirrored = true
    emit({ role: 'mirror' })
    await requestMirrorLock(active)
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError' || active.stopped) return
    console.error('[DocumentLease] Could not take the write lease:', error)
  }
}

export function startDocumentLease(sessionOptions: LeaseSessionOptions): () => void {
  stopDocumentLease()
  const active: LeaseSession = {
    key: sessionOptions.key,
    tabId: documentTabId(),
    presenceChannel: null,
    abort: null,
    releaseLock: null,
    releaseOpen: null,
    openAbort: null,
    openTask: null,
    stopped: false,
    mirrored: false,
    retry: createMirrorRetry(),
  }
  session = active
  options = sessionOptions
  // A fresh snapshot also notifies consumers that an acquiring session now exists,
  // even though the public role remains unchanged.
  state = { role: 'acquiring' }
  for (const listener of listeners) listener()

  openPresenceChannel(active)
  // Presence is independent of write ownership: every open tab (owner or mirror)
  // holds a shared lock so deletes can be blocked while the project is in use.
  startOpenPresence(active)
  void acquire(active)
  return () => {
    if (session === active) stopDocumentLease()
  }
}

export function stopDocumentLease(): void {
  const active = session
  if (!active) return
  active.stopped = true
  active.presenceChannel?.close()
  active.presenceChannel = null
  clearMirrorRetry(active.retry)
  releaseLock(active)
  releaseOpen(active)
  active.abort?.abort()
  session = null
  options = null
  state = IDLE_STATE
  for (const listener of listeners) listener()
}

function thisTabHoldsPresence(key: string): boolean {
  return Boolean(session && session.key === key && session.releaseOpen)
}

/**
 * Whether this browser may delete the document. Other open tabs hold shared presence.
 * Fail closed on probe errors (deletion is destructive). If Web Locks is missing,
 * assume a single tab — same recovery convention as `hold` / `acquire`.
 */
export async function canDeleteDocument(
  key: string,
  isActiveDocument: boolean,
): Promise<boolean> {
  if (await hasOpenDocumentPeer(key)) return false
  const locks = navigator.locks
  if (!locks) {
    console.warn('[DocumentLease] Web Locks unavailable; assuming this is the only tab.')
    return true
  }

  try {
    if (typeof locks.query === 'function') {
      const snapshot = await locks.query()
      const held = snapshot.held ?? []
      const pending = snapshot.pending ?? []
      const openName = documentOpenLockName(key)
      const leaseName = documentLeaseName(key)
      return canDeleteFromSnapshot(
        {
          openHeld: held.filter(lock => lock.name === openName).length,
          writeHeld: held.some(lock => lock.name === leaseName),
          writePending: pending.some(lock => lock.name === leaseName),
        },
        isActiveDocument,
        thisTabHoldsPresence(key),
        holdsWriteLease(),
      )
    }

    // No query() — fallback probes. An active tab cannot probe its own shared
    // presence with ifAvailable, so refuse active deletes without query support.
    if (isActiveDocument) return false
    const presenceFree = await locks.request(
      documentOpenLockName(key),
      { mode: 'exclusive', ifAvailable: true },
      lock => Boolean(lock),
    )
    if (!presenceFree) return false
    return await locks.request(
      documentLeaseName(key),
      { mode: 'exclusive', ifAvailable: true },
      lock => Boolean(lock),
    )
  } catch (error) {
    console.warn('[DocumentLease] Could not probe the project lock:', error)
    return false
  }
}

/**
 * Temporarily upgrades this tab's shared presence to an exclusive deletion guard.
 * The write lease remains held throughout, while the exclusive presence lock blocks
 * another tab from opening the document during the destructive operation.
 *
 * Only failures to acquire/probe the guard map to `{ acquired: false }`. Once the
 * guard is actually held, errors thrown by `action` (save/report/delete) propagate
 * to the caller so real failures are never silently reported as "in use elsewhere".
 */
export async function withActiveDocumentDeleteGuard<T>(
  key: string,
  action: () => Promise<T>,
): Promise<DeleteGuardResult<T>> {
  const active = session
  if (
    !active
    || active.key !== key
    || active.stopped
    || state.role !== 'owner'
    || await hasOpenDocumentPeer(key)
  ) {
    return { acquired: false }
  }
  const locks = navigator.locks
  if (!locks) {
    return { acquired: true, value: await action() }
  }

  let downgraded = false
  try {
    releaseOpen(active)
    await active.openTask
    downgraded = true
  } catch (error) {
    console.warn('[DocumentLease] Could not release open presence for deletion guard:', error)
  }
  if (!downgraded || session !== active || active.stopped || state.role !== 'owner') {
    if (session === active && !active.stopped) startOpenPresence(active)
    return { acquired: false }
  }

  let guardHeld = false
  try {
    return await locks.request(
      documentOpenLockName(key),
      { mode: 'exclusive', ifAvailable: true },
      async openLock => {
        if (!openLock || session !== active || state.role !== 'owner') {
          return { acquired: false }
        }
        guardHeld = true
        return { acquired: true, value: await action() }
      },
    )
  } catch (error) {
    if (guardHeld) throw error
    console.warn('[DocumentLease] Could not guard active project deletion:', error)
    return { acquired: false }
  } finally {
    if (session === active && !active.stopped) startOpenPresence(active)
  }
}
