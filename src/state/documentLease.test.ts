import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FakeBroadcastChannel,
  FakeLockManager,
  resetChannelBus,
  settleTabs,
} from '@/test/fakeTabEnvironment'

type LeaseModule = typeof import('./documentLease')

const KEY = 'guest::project-1'
const OTHER_SCOPE_KEY = 'user-7::project-1'

/** Each tab is its own module registry, so module-level lease state is per tab. */
async function openTab(): Promise<LeaseModule> {
  vi.resetModules()
  return import('./documentLease')
}

function leaseName(key: string): string {
  return `table-canvas:doc-lease:${key}`
}

let locks: FakeLockManager

beforeEach(() => {
  locks = new FakeLockManager()
  resetChannelBus()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('documentLease', () => {
  it('keeps ownership through a StrictMode double mount', async () => {
    const tab = await openTab()
    const flush = vi.fn(async () => undefined)

    // React 18 StrictMode: mount, cleanup, mount again.
    const stopFirst = tab.startDocumentLease({ key: KEY, flush })
    await settleTabs()
    expect(tab.getLeaseState().role).toBe('owner')

    stopFirst()
    const stopSecond = tab.startDocumentLease({ key: KEY, flush })
    await settleTabs()

    expect(tab.getLeaseState().role).toBe('owner')
    expect(tab.holdsWriteLease()).toBe(true)
    stopSecond()
  })

  it('does not re-read the document for the first tab to take it', async () => {
    const tab = await openTab()
    const onPromoted = vi.fn(async () => undefined)
    tab.startDocumentLease({ key: KEY, flush: async () => undefined, onPromoted })
    await settleTabs()

    // Nothing can have moved the document since this tab loaded it, and IndexedDB may
    // be the staler copy, so adopting it here would discard work.
    expect(tab.getLeaseState().role).toBe('owner')
    expect(onPromoted).not.toHaveBeenCalled()
    tab.stopDocumentLease()
  })

  it('promotes the queued tab when the owner goes away', async () => {
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    const follower = await openTab()
    follower.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    expect(owner.getLeaseState().role).toBe('owner')
    expect(follower.getLeaseState().role).toBe('mirror')
    expect(follower.holdsWriteLease()).toBe(false)

    owner.stopDocumentLease()
    await settleTabs()

    expect(follower.getLeaseState().role).toBe('owner')
    expect(follower.holdsWriteLease()).toBe(true)
    follower.stopDocumentLease()
  })

  it('hands editing over after the outgoing owner flushes', async () => {
    const owner = await openTab()
    const flush = vi.fn(async () => undefined)
    owner.startDocumentLease({ key: KEY, flush })
    await settleTabs()

    const follower = await openTab()
    const onPromoted = vi.fn(async () => undefined)
    follower.startDocumentLease({ key: KEY, flush: async () => undefined, onPromoted })
    await settleTabs()

    follower.requestWriteLease()
    expect(follower.getLeaseState().requesting).toBe(true)
    await settleTabs()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(onPromoted).toHaveBeenCalledTimes(1)
    expect(follower.getLeaseState()).toEqual({
      role: 'owner',
      requesting: false,
      refused: false,
      unreachable: false,
    })
    expect(owner.getLeaseState().role).toBe('mirror')
    expect(owner.holdsWriteLease()).toBe(false)

    owner.stopDocumentLease()
    follower.stopDocumentLease()
  })

  it('keeps the owner when its flush fails and tells the requester', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await openTab()
    owner.startDocumentLease({
      key: KEY,
      flush: async () => {
        throw new Error('quota exceeded')
      },
    })
    await settleTabs()

    const follower = await openTab()
    follower.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    follower.requestWriteLease()
    await settleTabs()

    expect(owner.getLeaseState().role).toBe('owner')
    expect(owner.holdsWriteLease()).toBe(true)
    expect(follower.getLeaseState()).toEqual({
      role: 'mirror',
      requesting: false,
      refused: true,
      unreachable: false,
    })
    expect(locks.isHeld(leaseName(KEY))).toBe(true)

    owner.stopDocumentLease()
    follower.stopDocumentLease()
  })

  it('lets a second request follow a refusal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let failNextFlush = true
    const owner = await openTab()
    owner.startDocumentLease({
      key: KEY,
      flush: async () => {
        if (!failNextFlush) return
        failNextFlush = false
        throw new Error('quota exceeded')
      },
    })
    await settleTabs()

    const follower = await openTab()
    follower.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    follower.requestWriteLease()
    await settleTabs()
    expect(follower.getLeaseState().refused).toBe(true)

    follower.requestWriteLease()
    await settleTabs()

    expect(follower.getLeaseState()).toEqual({
      role: 'owner',
      requesting: false,
      refused: false,
      unreachable: false,
    })

    owner.stopDocumentLease()
    follower.stopDocumentLease()
  })

  it('marks the owner unreachable when handover is never answered', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await openTab()
    owner.startDocumentLease({
      key: KEY,
      // Never resolves: simulates a frozen owner that still holds the lock.
      flush: () => new Promise(() => {}),
    })
    await settleTabs()

    const follower = await openTab()
    follower.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    vi.useFakeTimers()
    follower.requestWriteLease()
    expect(follower.getLeaseState().requesting).toBe(true)

    await vi.advanceTimersByTimeAsync(follower.HANDOVER_REQUEST_TIMEOUT_MS)
    expect(follower.getLeaseState()).toEqual({
      role: 'mirror',
      requesting: false,
      refused: false,
      unreachable: true,
    })

    // Try again must be able to send another request after the timeout clears.
    follower.requestWriteLease()
    expect(follower.getLeaseState().requesting).toBe(true)
    expect(follower.getLeaseState().unreachable).toBe(false)

    vi.useRealTimers()
    owner.stopDocumentLease()
    follower.stopDocumentLease()
  })

  it('refuses handover when the owner flush hangs past the flush timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await openTab()
    owner.startDocumentLease({
      key: KEY,
      flush: () => new Promise(() => {}),
    })
    await settleTabs()

    const follower = await openTab()
    follower.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    vi.useFakeTimers()
    follower.requestWriteLease()
    await vi.advanceTimersByTimeAsync(owner.HANDOVER_FLUSH_TIMEOUT_MS)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(owner.getLeaseState().role).toBe('owner')
    expect(follower.getLeaseState()).toEqual({
      role: 'mirror',
      requesting: false,
      refused: true,
      unreachable: false,
    })

    vi.useRealTimers()
    owner.stopDocumentLease()
    follower.stopDocumentLease()
  })

  it('treats the same project id in another scope as a different document', async () => {
    const guestTab = await openTab()
    guestTab.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    const signedInTab = await openTab()
    signedInTab.startDocumentLease({ key: OTHER_SCOPE_KEY, flush: async () => undefined })
    await settleTabs()

    expect(guestTab.getLeaseState().role).toBe('owner')
    expect(signedInTab.getLeaseState().role).toBe('owner')

    guestTab.stopDocumentLease()
    signedInTab.stopDocumentLease()
  })

  it('assumes a single tab when Web Locks are unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
    const tab = await openTab()

    tab.startDocumentLease({ key: KEY, flush: async () => undefined })
    await settleTabs()

    expect(tab.getLeaseState().role).toBe('owner')
    expect(tab.holdsWriteLease()).toBe(true)
    tab.stopDocumentLease()
  })
})
