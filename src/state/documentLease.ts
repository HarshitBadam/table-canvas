import { documentLeaseName } from './documentIdentity'

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
    stopped: false,
    mirrored: false,
  }
  session = active
  options = sessionOptions
  state = IDLE_STATE

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
  active.abort?.abort()
  session = null
  options = null
  state = IDLE_STATE
  for (const listener of listeners) listener()
}

export async function canDeleteDocument(
  key: string,
  isActiveDocument: boolean,
): Promise<boolean> {
  if (isActiveDocument) return holdsWriteLease()
  const locks = navigator.locks
  if (!locks) return true
  try {
    return await locks.request(
      documentLeaseName(key),
      { mode: 'exclusive', ifAvailable: true },
      lock => Boolean(lock),
    )
  } catch (error) {
    console.warn('[DocumentLease] Could not probe the project lock:', error)
    return true
  }
}
