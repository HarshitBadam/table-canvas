import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accountDiscoveryPendingStorageKey,
  acknowledgeAccountDiscoveryTours,
  cacheAccountDiscoveryTours,
  completeGuestDiscoveryTour,
  guestDiscoveryTourStorageKey,
  normalizeDiscoveryTourState,
  queuePendingAccountDiscoveryTours,
  readCachedAccountDiscoveryTours,
  readGuestDiscoveryTours,
  readPendingAccountDiscoveryTours,
  resetDiscoveryTourAccountCacheForTests,
} from '@/discovery/discoveryTourPersistence'

let stored: Map<string, string>

describe('discoveryTourPersistence', () => {
  beforeEach(() => {
    stored = new Map<string, string>()
    resetDiscoveryTourAccountCacheForTests()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    } satisfies Partial<Storage>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores guest completion once for the browser rather than a project scope', () => {
    completeGuestDiscoveryTour('canvas')
    completeGuestDiscoveryTour('grid')

    expect(readGuestDiscoveryTours()).toEqual(['canvas', 'grid'])
    expect(stored.get(guestDiscoveryTourStorageKey())).toBe(
      JSON.stringify({ version: 1, completedTours: ['canvas', 'grid'] }),
    )
  })

  it('queues pending account completion independently by account', () => {
    queuePendingAccountDiscoveryTours('one', ['canvas'])
    queuePendingAccountDiscoveryTours('two', ['grid'])

    expect(readPendingAccountDiscoveryTours('one')).toEqual(['canvas'])
    expect(readPendingAccountDiscoveryTours('two')).toEqual(['grid'])
  })

  it('removes only account completions acknowledged by the server', () => {
    queuePendingAccountDiscoveryTours('one', ['canvas', 'report'])

    acknowledgeAccountDiscoveryTours('one', ['canvas'])
    expect(readPendingAccountDiscoveryTours('one')).toEqual(['report'])

    acknowledgeAccountDiscoveryTours('one', ['report'])
    expect(stored.get(accountDiscoveryPendingStorageKey('one'))).toBeUndefined()
  })

  it('ignores malformed, stale, and unknown stored values', () => {
    stored.set(guestDiscoveryTourStorageKey(), '{broken')
    expect(readGuestDiscoveryTours()).toEqual([])

    stored.set(
      guestDiscoveryTourStorageKey(),
      JSON.stringify({ version: 0, completedTours: ['canvas'] }),
    )
    expect(readGuestDiscoveryTours()).toEqual([])

    expect(normalizeDiscoveryTourState({
      version: 1,
      completedTours: ['canvas', 'unknown', 'canvas'],
    })).toEqual({ version: 1, completedTours: ['canvas'] })
  })

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {})

    expect(() => completeGuestDiscoveryTour('canvas')).not.toThrow()
    expect(readGuestDiscoveryTours()).toEqual([])
    expect(() => queuePendingAccountDiscoveryTours('one', ['grid'])).not.toThrow()
  })

  it('caches account completions in memory across remounts', () => {
    cacheAccountDiscoveryTours('one', ['canvas'])
    cacheAccountDiscoveryTours('one', ['report'])
    expect(readCachedAccountDiscoveryTours('one')).toEqual(['canvas', 'report'])
  })
})
