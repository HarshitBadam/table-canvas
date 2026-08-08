export const DISCOVERY_TOUR_VERSION = 1
export const DISCOVERY_TOUR_IDS = ['canvas', 'report', 'grid'] as const

export type DiscoveryTourId = typeof DISCOVERY_TOUR_IDS[number]

export interface DiscoveryTourState {
  version: number
  completedTours: DiscoveryTourId[]
}

const STORAGE_KEY_PREFIX = 'table-canvas:discovery-tours:v1'
const GUEST_STORAGE_KEY = `${STORAGE_KEY_PREFIX}:guest-browser`

export function guestDiscoveryTourStorageKey(): string {
  return GUEST_STORAGE_KEY
}

export function accountDiscoveryPendingStorageKey(accountId: string): string {
  return `${STORAGE_KEY_PREFIX}:pending:account:${accountId}`
}

function discoveryTourStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage
    if (
      typeof storage?.getItem !== 'function'
      || typeof storage.setItem !== 'function'
      || typeof storage.removeItem !== 'function'
    ) {
      return null
    }
    return storage
  } catch {
    return null
  }
}

export function normalizeDiscoveryTourState(value: unknown): DiscoveryTourState {
  if (typeof value !== 'object' || value === null) {
    return { version: DISCOVERY_TOUR_VERSION, completedTours: [] }
  }
  const record = value as Record<string, unknown>
  const completedTours = record.completedTours
  if (
    record.version !== DISCOVERY_TOUR_VERSION
    || !Array.isArray(completedTours)
  ) {
    return { version: DISCOVERY_TOUR_VERSION, completedTours: [] }
  }
  return {
    version: DISCOVERY_TOUR_VERSION,
    completedTours: DISCOVERY_TOUR_IDS.filter(
      tourId => completedTours.includes(tourId),
    ),
  }
}

function readState(key: string): DiscoveryTourState {
  const storage = discoveryTourStorage()
  if (!storage) return normalizeDiscoveryTourState(null)

  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return normalizeDiscoveryTourState(null)
  }
  if (!raw) return normalizeDiscoveryTourState(null)

  try {
    return normalizeDiscoveryTourState(JSON.parse(raw))
  } catch {
    return normalizeDiscoveryTourState(null)
  }
}

function writeState(key: string, completedTours: Iterable<DiscoveryTourId>): void {
  const storage = discoveryTourStorage()
  if (!storage) return
  const completed = new Set(completedTours)
  try {
    storage.setItem(key, JSON.stringify({
      version: DISCOVERY_TOUR_VERSION,
      completedTours: DISCOVERY_TOUR_IDS.filter(tourId =>
        completed.has(tourId),
      ),
    }))
  } catch {
    // Discovery preferences must never prevent the workspace from rendering.
  }
}

export function readGuestDiscoveryTours(): DiscoveryTourId[] {
  return readState(GUEST_STORAGE_KEY).completedTours
}

export function completeGuestDiscoveryTour(tourId: DiscoveryTourId): void {
  writeState(GUEST_STORAGE_KEY, [...readGuestDiscoveryTours(), tourId])
}

export function readPendingAccountDiscoveryTours(accountId: string): DiscoveryTourId[] {
  return readState(accountDiscoveryPendingStorageKey(accountId)).completedTours
}

export function queuePendingAccountDiscoveryTours(
  accountId: string,
  tourIds: Iterable<DiscoveryTourId>,
): DiscoveryTourId[] {
  const pending = Array.from(new Set([
    ...readPendingAccountDiscoveryTours(accountId),
    ...tourIds,
  ]))
  writeState(accountDiscoveryPendingStorageKey(accountId), pending)
  return DISCOVERY_TOUR_IDS.filter(tourId => pending.includes(tourId))
}

export function acknowledgeAccountDiscoveryTours(
  accountId: string,
  acknowledgedTourIds: Iterable<DiscoveryTourId>,
): void {
  const acknowledged = new Set(acknowledgedTourIds)
  const remaining = readPendingAccountDiscoveryTours(accountId)
    .filter(tourId => !acknowledged.has(tourId))
  const storage = discoveryTourStorage()
  if (!storage) return
  try {
    if (remaining.length === 0) {
      storage.removeItem(accountDiscoveryPendingStorageKey(accountId))
    } else {
      writeState(accountDiscoveryPendingStorageKey(accountId), remaining)
    }
  } catch {
    // Acknowledgement is retried on the next authenticated startup.
  }
}

const accountCompletionCache = new Map<string, Set<DiscoveryTourId>>()

export function readCachedAccountDiscoveryTours(
  accountId: string,
): DiscoveryTourId[] {
  return Array.from(accountCompletionCache.get(accountId) ?? [])
}

export function cacheAccountDiscoveryTours(
  accountId: string,
  tourIds: Iterable<DiscoveryTourId>,
): void {
  accountCompletionCache.set(accountId, new Set([
    ...(accountCompletionCache.get(accountId) ?? []),
    ...tourIds,
  ]))
}

export function resetDiscoveryTourAccountCacheForTests(): void {
  accountCompletionCache.clear()
}
