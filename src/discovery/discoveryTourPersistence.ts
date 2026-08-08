import { getStorageScope } from '@/persistence/storage/storageScope'

export const DISCOVERY_TOUR_IDS = ['canvas', 'report', 'grid'] as const

export type DiscoveryTourId = typeof DISCOVERY_TOUR_IDS[number]

type DiscoveryTourState = Partial<Record<DiscoveryTourId, true>>

const STORAGE_KEY_PREFIX = 'table-canvas:discovery-tours:v1'

export function discoveryTourStorageKey(scope: string): string {
  return `${STORAGE_KEY_PREFIX}:${scope}`
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

function readState(scope: string): DiscoveryTourState {
  const storage = discoveryTourStorage()
  if (!storage) return {}

  let raw: string | null
  try {
    raw = storage.getItem(discoveryTourStorageKey(scope))
  } catch {
    return {}
  }
  if (!raw) return {}

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}

    return DISCOVERY_TOUR_IDS.reduce<DiscoveryTourState>((state, tourId) => {
      if ((parsed as Record<string, unknown>)[tourId] === true) state[tourId] = true
      return state
    }, {})
  } catch {
    return {}
  }
}

function writeState(scope: string, state: DiscoveryTourState): void {
  const storage = discoveryTourStorage()
  if (!storage) return
  try {
    storage.setItem(discoveryTourStorageKey(scope), JSON.stringify(state))
  } catch {
    // Discovery preferences must never prevent the workspace from rendering.
  }
}

export function isDiscoveryTourComplete(
  tourId: DiscoveryTourId,
  scope = getStorageScope(),
): boolean {
  return readState(scope)[tourId] === true
}

export function completeDiscoveryTour(
  tourId: DiscoveryTourId,
  scope = getStorageScope(),
): void {
  writeState(scope, { ...readState(scope), [tourId]: true })
}

export function resetDiscoveryTours(
  scope = getStorageScope(),
  tourId?: DiscoveryTourId,
): void {
  const storage = discoveryTourStorage()
  if (!storage) return

  if (!tourId) {
    try {
      storage.removeItem(discoveryTourStorageKey(scope))
    } catch {
      // A replay action should remain best effort in restricted storage.
    }
    return
  }

  const state = readState(scope)
  delete state[tourId]
  writeState(scope, state)
}
