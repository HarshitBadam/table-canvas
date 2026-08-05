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
let authEpoch = 0

export interface StorageScopeContext {
  scope: string
  authEpoch: number
}

function activateStorageScope(scope: string): void {
  activeStorageScope = scope
  authEpoch += 1
}

export function accountStorageScope(userId: string): string {
  if (!userId.trim()) throw new Error('A user id is required for account storage')
  return `account:${userId}`
}

export function getStorageScope(): string {
  return activeStorageScope
}

export function captureStorageScopeContext(): StorageScopeContext {
  return { scope: activeStorageScope, authEpoch }
}

export function isStorageScopeContextCurrent(context: StorageScopeContext): boolean {
  return context.scope === activeStorageScope && context.authEpoch === authEpoch
}

export function setStorageScope(scope: string): void {
  if (!scope.trim()) throw new Error('Storage scope cannot be empty')
  activateStorageScope(scope)
}

export function isCloudStorageScope(): boolean {
  return !isGuestStorageScope(activeStorageScope)
}

export function isGuestStorageScope(scope: string): boolean {
  return scope.startsWith(GUEST_SCOPE_PREFIX)
}

type GuestLockOutcome = 'acquired' | 'busy' | 'aborted'

/** Fail fast if the Web Locks callback never fires (stuck lock manager). */
const GUEST_LOCK_CLAIM_TIMEOUT_MS = 2_500

/**
 * Settle from the Web Locks callback itself (`acquired` / `busy`), not microtask
 * timing — browsers may invoke it as a macrotask. On acquire, the request promise
 * keeps holding the lock until `guestScopeLockRelease` runs.
 */
function requestGuestScopeLock(
  name: string,
  signal: AbortSignal,
): Promise<GuestLockOutcome> {
  return new Promise<GuestLockOutcome>(resolve => {
    let settled = false
    const finish = (outcome: GuestLockOutcome): boolean => {
      if (settled) return false
      settled = true
      resolve(outcome)
      return true
    }

    if (signal.aborted) {
      finish('aborted')
      return
    }

    let request: Promise<unknown>
    try {
      request = navigator.locks.request(
        name,
        { mode: 'exclusive', ifAvailable: true },
        async lock => {
          if (signal.aborted) {
            finish('aborted')
            return
          }
          if (!lock) {
            finish('busy')
            return
          }
          // A timed-out request may be granted late. Returning immediately releases
          // that stale grant instead of retaining a lock for the fallback claim.
          if (!finish('acquired')) return
          await new Promise<void>(release => {
            guestScopeLockRelease = release
          })
        },
      )
    } catch (error) {
      console.warn('[storageScope] Guest scope lock request threw:', error)
      finish('aborted')
      return
    }

    void request.catch(error => {
      // Must settle; a pending claim freezes guest login on "Opening…".
      if (
        (error instanceof DOMException && error.name === 'AbortError')
        || (error as { name?: string })?.name === 'AbortError'
      ) {
        finish('aborted')
        return
      }
      console.warn('[storageScope] Guest scope lock request failed:', error)
      finish('aborted')
    })
  })
}

interface GuestScopeLockResult {
  scope: string
  acquired: boolean
}

async function claimGuestScopeWithLocks(initialScope: string): Promise<GuestScopeLockResult> {
  const locks = navigator.locks
  if (!locks) return { scope: initialScope, acquired: false }

  let scope = initialScope
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const abort = new AbortController()
    guestScopeClaimAbort = abort
    let timer: ReturnType<typeof setTimeout> | null = null
    const outcome = await new Promise<GuestLockOutcome>(resolve => {
      let settled = false
      const finish = (value: GuestLockOutcome) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        resolve(value)
      }
      timer = setTimeout(() => {
        abort.abort()
        finish('aborted')
      }, GUEST_LOCK_CLAIM_TIMEOUT_MS)
      void requestGuestScopeLock(`${GUEST_SCOPE_LOCK_PREFIX}${scope}`, abort.signal)
        .then(finish)
    })
    if (outcome === 'acquired') {
      guestScopeClaimAbort = null
      return { scope, acquired: true }
    }
    if (outcome === 'aborted') {
      // Stuck/cancelled lock manager: stop retrying and hand back this contended
      // scope for BroadcastChannel fallback (not the original, already-busy one).
      guestScopeClaimAbort = null
      return { scope, acquired: false }
    }
    guestScopeClaimAbort = null
    scope = `${GUEST_SCOPE_PREFIX}${randomId()}`
    persistGuestScope(scope)
  }
  // No lock held after retries — continue from the last scope for BC isolation.
  return { scope, acquired: false }
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
 * Tab duplicates clone sessionStorage; Web Lock (+ BroadcastChannel fallback)
 * mints a fresh scope. A normal reload reclaims the same scope after release.
 */
export async function claimGuestStorageScope(): Promise<string> {
  releaseGuestStorageScopeClaim()

  let scope = readGuestScope()
  try {
    const result = await claimGuestScopeWithLocks(scope)
    scope = result.scope
    if (result.acquired) {
      activateStorageScope(scope)
      return scope
    }
  } catch (error) {
    console.warn('[storageScope] Guest Web Lock claim failed; using BroadcastChannel:', error)
  }

  if (typeof BroadcastChannel !== 'undefined') {
    scope = await claimGuestScopeWithBroadcast(scope)
  } else {
    // Last resort: mint an isolated in-memory scope for this page lifetime.
    scope = `${GUEST_SCOPE_PREFIX}${randomId()}`
    persistGuestScope(scope)
  }
  activateStorageScope(scope)
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

/**
 * Drop the account partition after logout so persistence cannot touch the prior
 * user's IndexedDB keys. Does not hold a guest lock (next claim will).
 */
export function resetLoggedOutStorageScope(): void {
  releaseGuestStorageScopeClaim()
  activateStorageScope(readGuestScope())
}

const KEY_SEPARATOR = '\u001f'

/** Pre-per-tab guest partition. Records under this owner are migrated once. */
export const LEGACY_GUEST_STORAGE_SCOPE = 'guest'

export function scopedStorageKey(scope: string, entityId: string): string {
  return `${scope}${KEY_SEPARATOR}${entityId}`
}

export function entityIdFromScopedKey(scopedKey: string): string {
  const separator = scopedKey.indexOf(KEY_SEPARATOR)
  return separator === -1 ? scopedKey : scopedKey.slice(separator + 1)
}
