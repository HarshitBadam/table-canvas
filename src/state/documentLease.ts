import {
  documentLeaseChannel,
  documentLeaseName,
  documentTabId,
} from './documentIdentity'

/**
 * Exactly one tab per document may write it. Ownership is only ever established by
 * actually holding the Web Lock — never inferred from a failed probe, which is what
 * used to make a StrictMode double mount look like a second tab. Tabs that do not own
 * the document stay queued on the lock and are promoted the moment it is released,
 * whether that release came from a handover, a closed tab, or a crash.
 */
export type LeaseRole = 'acquiring' | 'owner' | 'mirror'

export interface LeaseState {
  role: LeaseRole
  /** This tab asked the owner to hand editing over and is waiting. */
  requesting: boolean
  /** The owner kept editing because it could not save its work. */
  refused: boolean
  /** The owner never answered; it is likely frozen, crashed, or stuck saving. */
  unreachable: boolean
}

type LeaseMessage =
  | { type: 'who-owns'; tabId: string }
  | { type: 'owner'; tabId: string }
  | { type: 'handover'; tabId: string }
  | { type: 'refused'; tabId: string; requesterId: string }

interface LeaseSession {
  key: string
  channel: BroadcastChannel | null
  abort: AbortController | null
  releaseLock: (() => void) | null
  stopped: boolean
  /** True once another tab has owned the document while this one watched. */
  mirrored: boolean
  requestTimer: ReturnType<typeof setTimeout> | null
  handingOver: boolean
}

export interface LeaseSessionOptions {
  key: string
  /** Runs before the lock is released so the outgoing owner loses nothing. */
  flush: () => Promise<void>
  /** Runs when a mirror becomes the owner, before writes are re-enabled. */
  onPromoted?: () => Promise<void> | void
}

/** How long a mirror waits for the owner to answer a handover request. */
export const HANDOVER_REQUEST_TIMEOUT_MS = 8_000

/** Cap how long the owner may spend flushing before it must refuse instead of hang. */
export const HANDOVER_FLUSH_TIMEOUT_MS = 15_000

const IDLE_STATE: LeaseState = {
  role: 'acquiring',
  requesting: false,
  refused: false,
  unreachable: false,
}

let session: LeaseSession | null = null
let options: LeaseSessionOptions | null = null
let state: LeaseState = IDLE_STATE
const listeners = new Set<() => void>()

function emit(next: Partial<LeaseState>): void {
  const merged = { ...state, ...next }
  if (
    merged.role === state.role
    && merged.requesting === state.requesting
    && merged.refused === state.refused
    && merged.unreachable === state.unreachable
  ) return
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

function send(
  message: { type: LeaseMessage['type']; requesterId?: string },
): void {
  session?.channel?.postMessage({ ...message, tabId: documentTabId() })
}

function clearRequestTimer(active: LeaseSession): void {
  if (!active.requestTimer) return
  clearTimeout(active.requestTimer)
  active.requestTimer = null
}

function handleMessage(active: LeaseSession, message: LeaseMessage): void {
  if (message.tabId === documentTabId()) return
  switch (message.type) {
    case 'who-owns':
      if (state.role === 'owner') send({ type: 'owner' })
      return
    case 'owner':
      if (state.role !== 'owner') {
        active.mirrored = true
        emit({ role: 'mirror' })
      }
      return
    case 'handover':
      void handOver(active, message.tabId)
      return
    case 'refused':
      if (message.requesterId === documentTabId()) {
        clearRequestTimer(active)
        emit({ requesting: false, refused: true, unreachable: false })
      }
      return
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(label))
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function handOver(active: LeaseSession, requesterId: string): Promise<void> {
  if (state.role !== 'owner' || active.stopped || active.handingOver) return
  active.handingOver = true
  try {
    await withTimeout(
      Promise.resolve(options?.flush()).then(() => undefined),
      HANDOVER_FLUSH_TIMEOUT_MS,
      'Handover flush timed out',
    )
  } catch (error) {
    console.error('[DocumentLease] Keeping editing here; the save failed:', error)
    send({ type: 'refused', requesterId })
    return
  } finally {
    active.handingOver = false
  }
  if (active.stopped || state.role !== 'owner') return
  releaseLock(active)
}

function releaseLock(active: LeaseSession): void {
  const resolve = active.releaseLock
  active.releaseLock = null
  resolve?.()
}

async function hold(active: LeaseSession, lock: Lock | null): Promise<void> {
  if (active.stopped || !lock) return
  clearRequestTimer(active)
  emit({ role: 'owner', requesting: false, refused: false, unreachable: false })
  send({ type: 'owner' })
  // Only a tab that was mirroring can be behind the document. On the first acquisition
  // the store was just loaded, and IndexedDB may be the staler of the two.
  if (active.mirrored) {
    try {
      await options?.onPromoted?.()
    } catch (error) {
      console.error('[DocumentLease] Could not refresh before editing here:', error)
    }
  }
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
  while (!active.stopped) {
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
      emit({ role: 'owner' })
      return
    }
    // The lock promise has settled, so the lock is genuinely free: re-queue behind
    // whichever tab takes it next instead of guessing who owns it now.
    if (active.stopped) return
    active.mirrored = true
    clearRequestTimer(active)
    emit({ role: 'mirror', requesting: false })
  }
}

export function startDocumentLease(sessionOptions: LeaseSessionOptions): () => void {
  stopDocumentLease()
  const active: LeaseSession = {
    key: sessionOptions.key,
    channel: null,
    abort: null,
    releaseLock: null,
    stopped: false,
    mirrored: false,
    requestTimer: null,
    handingOver: false,
  }
  session = active
  options = sessionOptions
  state = IDLE_STATE

  if (typeof BroadcastChannel !== 'undefined') {
    active.channel = new BroadcastChannel(documentLeaseChannel(active.key))
    active.channel.onmessage = (event: MessageEvent<LeaseMessage>) => {
      if (!active.stopped) handleMessage(active, event.data)
    }
  }
  send({ type: 'who-owns' })
  void acquire(active)
  return () => {
    if (session === active) stopDocumentLease()
  }
}

export function stopDocumentLease(): void {
  const active = session
  if (!active) return
  active.stopped = true
  clearRequestTimer(active)
  releaseLock(active)
  active.abort?.abort()
  active.channel?.close()
  session = null
  options = null
  state = IDLE_STATE
  for (const listener of listeners) listener()
}

/** Focus or edit intent in a mirror tab: ask the owner to hand editing over. */
export function requestWriteLease(): void {
  if (!session || state.role === 'owner' || state.requesting) return
  const active = session
  clearRequestTimer(active)
  emit({ requesting: true, refused: false, unreachable: false })
  send({ type: 'handover' })
  active.requestTimer = setTimeout(() => {
    active.requestTimer = null
    if (session !== active || state.role === 'owner' || !state.requesting) return
    emit({ requesting: false, refused: false, unreachable: true })
  }, HANDOVER_REQUEST_TIMEOUT_MS)
}
