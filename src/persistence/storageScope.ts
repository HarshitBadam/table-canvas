const GUEST_SCOPE_PREFIX = 'guest:'
const GUEST_SCOPE_KEY = 'table-canvas:guest-storage-scope'
const GUEST_SCOPE_LOCK_PREFIX = 'table-canvas:guest-scope:'
const GUEST_CLAIM_CHANNEL = 'table-canvas:guest-scope-claims'

type GuestClaimMessage =
  | { type: 'probe'; scope: string; requestId: string }
  | { type: 'occupied'; scope: string; requestId: string }

let guestClaimChannel: BroadcastChannel | null = null
let guestScopeLockRelease: (() => void) | null = null
let guestScopeClaimAbort: AbortController | null = null

function randomId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readGuestScope(): string {
  try {
    const stored = sessionStorage.getItem(GUEST_SCOPE_KEY)
    if (stored?.startsWith(GUEST_SCOPE_PREFIX)) return stored
  } catch {
    // Restricted storage still gets an isolated scope for this page lifetime.
  }
  const scope = `${GUEST_SCOPE_PREFIX}${randomId()}`
  try {
    sessionStorage.setItem(GUEST_SCOPE_KEY, scope)
  } catch {
    // The in-memory value remains stable until this page is unloaded.
  }
  return scope
}

function persistGuestScope(scope: string): void {
  try {
    sessionStorage.setItem(GUEST_SCOPE_KEY, scope)
  } catch {
    // Keep the newly generated scope in memory.
  }
}

let activeStorageScope = readGuestScope()

export function accountStorageScope(userId: string): string {
  if (!userId.trim()) throw new Error('A user id is required for account storage')
  return `account:${userId}`
}

export function getStorageScope(): string {
  return activeStorageScope
}

export function setStorageScope(scope: string): void {
  if (!scope.trim()) throw new Error('Storage scope cannot be empty')
  activeStorageScope = scope
}

export function isCloudStorageScope(): boolean {
  return !isGuestStorageScope(activeStorageScope)
}

export function isGuestStorageScope(scope: string): boolean {
  return scope.startsWith(GUEST_SCOPE_PREFIX)
}

type GuestLockOutcome = 'acquired' | 'busy' | 'aborted'

/**
 * Requests the guest scope lock and resolves the moment the Web Locks callback
 * actually fires — with 'acquired' or 'busy' — instead of guessing based on
 * microtask timing (the callback invocation is not guaranteed to happen within
 * one queued microtask tick; it can land as a macrotask). When acquired, the
 * underlying `locks.request` promise keeps running in the background, holding
 * the lock until `guestScopeLockRelease` is invoked.
 */
function requestGuestScopeLock(name: string, signal: AbortSignal): Promise<GuestLockOutcome> {
  return new Promise<GuestLockOutcome>(resolve => {
    const request = navigator.locks.request(
      name,
      { mode: 'exclusive', ifAvailable: true, signal },
      async lock => {
        if (!lock) {
          resolve('busy')
          return
        }
        resolve('acquired')
        await new Promise<void>(release => {
          guestScopeLockRelease = release
        })
      },
    )
    request.catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        resolve('aborted')
      }
    })
  })
}

async function claimGuestScopeWithLocks(initialScope: string): Promise<string | null> {
  const locks = navigator.locks
  if (!locks) return null

  let scope = initialScope
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const abort = new AbortController()
    guestScopeClaimAbort = abort
    const outcome = await requestGuestScopeLock(`${GUEST_SCOPE_LOCK_PREFIX}${scope}`, abort.signal)
    if (outcome === 'acquired') {
      return scope
    }
    if (outcome === 'aborted') {
      // The claim was cancelled out from under us; fall back to the
      // BroadcastChannel path rather than continuing to mint scopes.
      guestScopeClaimAbort = null
      return null
    }
    guestScopeClaimAbort = null
    scope = `${GUEST_SCOPE_PREFIX}${randomId()}`
    persistGuestScope(scope)
  }
  return scope
}

async function claimGuestScopeWithBroadcast(initialScope: string): Promise<string> {
  let scope = initialScope
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const channel = new BroadcastChannel(GUEST_CLAIM_CHANNEL)
    const requestId = randomId()
    let occupied = false
    channel.onmessage = (event: MessageEvent<GuestClaimMessage>) => {
      const message = event.data
      if (message.type === 'probe' && message.scope === scope) {
        channel.postMessage({
          type: 'occupied',
          scope,
          requestId: message.requestId,
        } satisfies GuestClaimMessage)
      } else if (
        message.type === 'occupied'
        && message.scope === scope
        && message.requestId === requestId
      ) {
        occupied = true
      }
    }
    channel.postMessage({ type: 'probe', scope, requestId } satisfies GuestClaimMessage)
    await new Promise(resolve => setTimeout(resolve, 50))
    if (!occupied) {
      guestClaimChannel = channel
      return scope
    }
    channel.close()
    scope = `${GUEST_SCOPE_PREFIX}${randomId()}`
    persistGuestScope(scope)
  }
  return scope
}

/**
 * Duplicating a tab can clone sessionStorage. A Web Lock (with BroadcastChannel
 * fallback) gives the duplicate a fresh scope while a normal reload keeps the
 * existing one after the previous page releases its claim.
 */
export async function claimGuestStorageScope(): Promise<string> {
  releaseGuestStorageScopeClaim()

  let scope = readGuestScope()
  const locked = await claimGuestScopeWithLocks(scope)
  if (locked !== null) {
    activeStorageScope = locked
    return locked
  }

  if (typeof BroadcastChannel !== 'undefined') {
    scope = await claimGuestScopeWithBroadcast(scope)
  }
  activeStorageScope = scope
  return scope
}

export function releaseGuestStorageScopeClaim(): void {
  guestClaimChannel?.close()
  guestClaimChannel = null
  const release = guestScopeLockRelease
  guestScopeLockRelease = null
  release?.()
  guestScopeClaimAbort?.abort()
  guestScopeClaimAbort = null
}

const KEY_SEPARATOR = '\u001f'

export function scopedStorageKey(scope: string, entityId: string): string {
  return `${scope}${KEY_SEPARATOR}${entityId}`
}
