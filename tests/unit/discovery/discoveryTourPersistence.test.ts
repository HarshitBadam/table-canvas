import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeDiscoveryTour,
  discoveryTourStorageKey,
  isDiscoveryTourComplete,
  resetDiscoveryTours,
} from '@/discovery/discoveryTourPersistence'

let stored: Map<string, string>

describe('discoveryTourPersistence', () => {
  beforeEach(() => {
    stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    } satisfies Partial<Storage>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores completion independently by scope and surface', () => {
    completeDiscoveryTour('canvas', 'account:one')
    completeDiscoveryTour('grid', 'account:two')

    expect(isDiscoveryTourComplete('canvas', 'account:one')).toBe(true)
    expect(isDiscoveryTourComplete('grid', 'account:one')).toBe(false)
    expect(isDiscoveryTourComplete('grid', 'account:two')).toBe(true)
  })

  it('can reset one tour without resetting the others', () => {
    completeDiscoveryTour('canvas', 'account:one')
    completeDiscoveryTour('report', 'account:one')

    resetDiscoveryTours('account:one', 'canvas')

    expect(isDiscoveryTourComplete('canvas', 'account:one')).toBe(false)
    expect(isDiscoveryTourComplete('report', 'account:one')).toBe(true)
  })

  it('can reset every tour in a scope', () => {
    completeDiscoveryTour('canvas', 'account:one')
    completeDiscoveryTour('report', 'account:one')

    resetDiscoveryTours('account:one')

    expect(stored.get(discoveryTourStorageKey('account:one'))).toBeUndefined()
  })

  it('ignores malformed and unknown stored values', () => {
    stored.set(discoveryTourStorageKey('account:one'), '{broken')
    expect(isDiscoveryTourComplete('canvas', 'account:one')).toBe(false)

    stored.set(
      discoveryTourStorageKey('account:one'),
      JSON.stringify({ canvas: 'yes', unknown: true }),
    )
    expect(isDiscoveryTourComplete('canvas', 'account:one')).toBe(false)
  })

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {})

    expect(() => completeDiscoveryTour('canvas', 'account:one')).not.toThrow()
    expect(isDiscoveryTourComplete('canvas', 'account:one')).toBe(false)
    expect(() => resetDiscoveryTours('account:one')).not.toThrow()
  })
})
