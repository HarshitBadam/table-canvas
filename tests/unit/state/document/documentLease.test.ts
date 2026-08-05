import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FakeBroadcastChannel,
  FakeLockManager,
  resetChannelBus,
  settleTabs,
} from '@test/fakeTabEnvironment'

type LeaseModule = typeof import('@/state/document/documentLease')

const KEY = 'guest:tab-a\u001fproject-1'
const OTHER_SCOPE_KEY = 'account:user-7\u001fproject-1'

/** Fresh module registry per tab so module-level lease state stays isolated. */
async function openTab(): Promise<LeaseModule> {
  vi.resetModules()
  return import('@/state/document/documentLease')
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

    const stopFirst = tab.startDocumentLease({ key: KEY })
    await settleTabs()
    expect(tab.getLeaseState().role).toBe('owner')

    stopFirst()
    const stopSecond = tab.startDocumentLease({ key: KEY })
    await settleTabs()

    expect(tab.getLeaseState().role).toBe('owner')
    expect(tab.holdsWriteLease()).toBe(true)
    stopSecond()
  })

  it('does not re-read the document for the first tab to take it', async () => {
    const tab = await openTab()
    const onPromoted = vi.fn(async () => undefined)
    tab.startDocumentLease({ key: KEY, onPromoted })
    await settleTabs()

    expect(tab.getLeaseState().role).toBe('owner')
    expect(onPromoted).not.toHaveBeenCalled()
    tab.stopDocumentLease()
  })

  it('uses browser-compatible options for the immediate lock probe', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const tab = await openTab()

    tab.startDocumentLease({ key: KEY })
    await settleTabs()

    expect(tab.getLeaseState().role).toBe('owner')
    expect(consoleError).not.toHaveBeenCalled()
    tab.stopDocumentLease()
  })

  it('promotes the queued reader when the owner goes away', async () => {
    const owner = await openTab()
    const ownerPromoted = vi.fn(async () => undefined)
    owner.startDocumentLease({ key: KEY, onPromoted: ownerPromoted })
    await settleTabs()

    const follower = await openTab()
    const onPromoted = vi.fn(async () => undefined)
    follower.startDocumentLease({ key: KEY, onPromoted })
    await settleTabs()

    expect(owner.getLeaseState().role).toBe('owner')
    expect(follower.getLeaseState().role).toBe('mirror')
    expect(follower.holdsWriteLease()).toBe(false)
    expect(onPromoted).not.toHaveBeenCalled()

    owner.stopDocumentLease()
    await settleTabs()

    expect(onPromoted).toHaveBeenCalledTimes(1)
    expect(follower.getLeaseState().role).toBe('owner')
    expect(follower.holdsWriteLease()).toBe(true)
    follower.stopDocumentLease()
  })

  it('stays fail-closed when durable adoption fails during promotion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()

    const follower = await openTab()
    follower.startDocumentLease({
      key: KEY,
      onPromoted: async () => {
        throw new Error('IndexedDB unavailable')
      },
    })
    await settleTabs()
    expect(follower.getLeaseState().role).toBe('mirror')

    owner.stopDocumentLease()
    await settleTabs()

    expect(follower.getLeaseState().role).toBe('mirror')
    expect(follower.holdsWriteLease()).toBe(false)
    follower.stopDocumentLease()
  })

  it('releases the write lock after a failed adoption instead of blocking every tab forever', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()

    const stuck = await openTab()
    stuck.startDocumentLease({
      key: KEY,
      onPromoted: async () => {
        throw new Error('IndexedDB unavailable')
      },
    })
    await settleTabs()

    owner.stopDocumentLease()
    await settleTabs()
    expect(stuck.getLeaseState().role).toBe('mirror')

    // Once the failed mirror releases the lock (even while it schedules its own
    // retry), a third tab must be able to take ownership rather than being
    // blocked by the stuck adopter forever.
    expect(locks.isHeld(leaseName(KEY))).toBe(false)
    const third = await openTab()
    third.startDocumentLease({ key: KEY })
    await settleTabs()

    expect(third.getLeaseState().role).toBe('owner')
    expect(third.holdsWriteLease()).toBe(true)
    stuck.stopDocumentLease()
    third.stopDocumentLease()
  })

  it('retries a failed mirror adoption and recovers to owner once it succeeds', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // settleTabs() drains microtasks with a real setTimeout(0), which never
    // fires under fake timers — advance-and-flush instead.
    const settle = () => vi.advanceTimersByTimeAsync(0)
    try {
      const owner = await openTab()
      owner.startDocumentLease({ key: KEY })
      await settle()

      let attempts = 0
      const follower = await openTab()
      follower.startDocumentLease({
        key: KEY,
        onPromoted: async () => {
          attempts += 1
          if (attempts === 1) throw new Error('IndexedDB unavailable')
        },
      })
      await settle()

      owner.stopDocumentLease()
      await settle()
      expect(follower.getLeaseState().role).toBe('mirror')
      expect(attempts).toBe(1)

      // Nobody else wants the lock, so the backoff retry re-acquires it itself
      // and succeeds on the second attempt.
      await vi.advanceTimersByTimeAsync(5000)

      expect(attempts).toBe(2)
      expect(follower.getLeaseState().role).toBe('owner')
      expect(follower.holdsWriteLease()).toBe(true)
      follower.stopDocumentLease()
    } finally {
      vi.useRealTimers()
    }
  })

  it('matches write ownership to the exact document key', async () => {
    const tab = await openTab()
    tab.startDocumentLease({ key: KEY })
    await settleTabs()

    expect(tab.holdsWriteLease(KEY)).toBe(true)
    expect(tab.holdsWriteLease(OTHER_SCOPE_KEY)).toBe(false)
    tab.stopDocumentLease()
    expect(tab.holdsWriteLease(KEY)).toBe(false)
  })

  it('never exposes handover controls on the lease state', async () => {
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()
    const follower = await openTab()
    follower.startDocumentLease({ key: KEY })
    await settleTabs()

    expect(follower.getLeaseState()).toEqual({ role: 'mirror' })
    expect(follower).not.toHaveProperty('requestWriteLease')
    expect(Object.keys(follower.getLeaseState())).toEqual(['role'])

    owner.stopDocumentLease()
    follower.stopDocumentLease()
  })

  it('treats the same project id in another scope as a different document', async () => {
    const guestTab = await openTab()
    guestTab.startDocumentLease({ key: KEY })
    await settleTabs()

    const signedInTab = await openTab()
    signedInTab.startDocumentLease({ key: OTHER_SCOPE_KEY })
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

    tab.startDocumentLease({ key: KEY })
    await settleTabs()

    expect(tab.getLeaseState().role).toBe('owner')
    expect(tab.holdsWriteLease()).toBe(true)
    tab.stopDocumentLease()
  })
})
