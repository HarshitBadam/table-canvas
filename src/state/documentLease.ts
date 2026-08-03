import { documentLeaseName, documentOpenLockName } from './documentIdentity'

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
  abort: AbortController | null
  releaseLock: (() => void) | null
  releaseOpen: (() => void) | null
  openAbort: AbortController | null
  stopped: boolean
  /** True once another tab has owned the document while this one watched. */
  mirrored: boolean
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

/** True unless another tab is known to own this document, so writes fail closed. */
export function holdsWriteLease(): boolean {
  return !session || state.role === 'owner'
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
  active.openAbort = new AbortController()
  try {
    await locks.request(
      documentOpenLockName(active.key),
      { mode: 'shared', signal: active.openAbort.signal },
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
  }
}

async function hold(active: LeaseSession, lock: Lock | null): Promise<void> {
  if (active.stopped || !lock) return
  if (active.mirrored) {
    try {
      await options?.onPromoted?.()
    } catch (error) {
      // Keep the lock even when adoption fails. Releasing here would leave every
      // queued reader stuck as a mirror with nobody holding write ownership.
      console.error('[DocumentLease] Could not refresh before editing here:', error)
    }
  }
  if (active.stopped) return
  emit({ role: 'owner' })
  await new Promise<void>((resolve) => {
    active.releaseLock = resolve
  })
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
      { mode: 'exclusive', ifAvailable: true, signal: active.abort.signal },
      async lock => {
        if (!lock) return
        acquiredImmediately = true
        await hold(active, lock)
      },
    )
    if (acquiredImmediately || active.stopped) return
    active.mirrored = true
    emit({ role: 'mirror' })
    await locks.request(
      documentLeaseName(active.key),
      { mode: 'exclusive', signal: active.abort.signal },
      lock => hold(active, lock),
    )
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError' || active.stopped) return
    console.error('[DocumentLease] Could not take the write lease:', error)
    emit({ role: 'owner' })
  }
}

export function startDocumentLease(sessionOptions: LeaseSessionOptions): () => void {
  stopDocumentLease()
  const active: LeaseSession = {
    key: sessionOptions.key,
    abort: null,
    releaseLock: null,
    releaseOpen: null,
    openAbort: null,
    stopped: false,
    mirrored: false,
  }
  session = active
  options = sessionOptions
  state = IDLE_STATE

  // Presence is independent of write ownership: every open tab (owner or mirror)
  // holds a shared lock so deletes can be blocked while the project is in use.
  void holdOpenPresence(active)
  void acquire(active)
  return () => {
    if (session === active) stopDocumentLease()
  }
}

export function stopDocumentLease(): void {
  const active = session
  if (!active) return
  active.stopped = true
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
 * Whether this browser may delete the document. Any other tab that still has it
 * open holds a shared presence lock. Fail closed when the API exists but the
 * probe errors — deletion is destructive. When Web Locks is entirely
 * unavailable, follow the same convention as the rest of this module (`hold`,
 * `acquire`, `holdsWriteLease`): assume a single tab rather than blocking a
 * capability gap into a stuck "can't delete anything" state.
 */
export async function canDeleteDocument(
  key: string,
  isActiveDocument: boolean,
): Promise<boolean> {
  const locks = navigator.locks
  if (!locks) {
    console.warn('[DocumentLease] Web Locks unavailable; assuming this is the only tab.')
    return true
  }

  try {
    if (typeof locks.query === 'function') {
      const snapshot = await locks.query()
      const openName = documentOpenLockName(key)
      const leaseName = documentLeaseName(key)
      const openHeld = snapshot.held.filter(lock => lock.name === openName).length
      const writeHeld = snapshot.held.some(lock => lock.name === leaseName)
      const writePending = snapshot.pending.some(lock => lock.name === leaseName)

      if (isActiveDocument) {
        // This tab contributes one shared presence holder. Any additional holder
        // (or a queued write waiter) means another tab still has the project open.
        if (openHeld > 1) return false
        if (openHeld === 1) {
          if (!thisTabHoldsPresence(key)) return false
          return !writePending
        }
        // Presence not registered yet — only allow if we already own the write
        // lease and nobody else is waiting for it.
        if (!holdsWriteLease() || writePending) return false
        return true
      }

      if (openHeld > 0 || writeHeld || writePending) return false
      return true
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
