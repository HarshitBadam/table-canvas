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

function openName(key: string): string {
  return `table-canvas:doc-open:${key}`
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

  it('keeps ownership when durable adoption fails during promotion', async () => {
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

    expect(follower.getLeaseState().role).toBe('owner')
    expect(follower.holdsWriteLease()).toBe(true)
    expect(locks.isHeld(leaseName(KEY))).toBe(true)
    follower.stopDocumentLease()
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

  it('holds shared open presence for every tab on the document', async () => {
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()
    expect(locks.holderCount(openName(KEY))).toBe(1)

    const follower = await openTab()
    follower.startDocumentLease({ key: KEY })
    await settleTabs()
    expect(locks.holderCount(openName(KEY))).toBe(2)

    owner.stopDocumentLease()
    await settleTabs()
    expect(locks.holderCount(openName(KEY))).toBe(1)

    follower.stopDocumentLease()
    await settleTabs()
    expect(locks.holderCount(openName(KEY))).toBe(0)
  })

  it('allows deleting the active document only while no other tab has it open', async () => {
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()
    expect(await owner.canDeleteDocument(KEY, true)).toBe(true)

    const follower = await openTab()
    follower.startDocumentLease({ key: KEY })
    await settleTabs()
    expect(await owner.canDeleteDocument(KEY, true)).toBe(false)
    expect(await follower.canDeleteDocument(KEY, true)).toBe(false)

    owner.stopDocumentLease()
    follower.stopDocumentLease()
  })

  it('blocks deleting a project that is open in another tab', async () => {
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()

    const other = await openTab()
    expect(await other.canDeleteDocument(KEY, false)).toBe(false)
    expect(locks.isHeld(openName(KEY))).toBe(true)

    expect(await other.canDeleteDocument(OTHER_SCOPE_KEY, false)).toBe(true)
    expect(locks.isHeld(openName(OTHER_SCOPE_KEY))).toBe(false)

    owner.stopDocumentLease()
  })

  it('holds deletion guards through an inactive project delete', async () => {
    const tab = await openTab()
    const action = vi.fn(async () => {
      expect(locks.isHeld(openName(KEY))).toBe(true)
      expect(locks.isHeld(leaseName(KEY))).toBe(true)
      return 'deleted'
    })

    const result = await tab.withInactiveDocumentDeleteGuard(KEY, action)

    expect(result).toEqual({ acquired: true, value: 'deleted' })
    expect(action).toHaveBeenCalledTimes(1)
    expect(locks.isHeld(openName(KEY))).toBe(false)
    expect(locks.isHeld(leaseName(KEY))).toBe(false)
  })

  it('does not start an inactive delete while another tab has the project open', async () => {
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()
    const other = await openTab()
    const action = vi.fn()

    const result = await other.withInactiveDocumentDeleteGuard(KEY, action)

    expect(result).toEqual({ acquired: false })
    expect(action).not.toHaveBeenCalled()
    owner.stopDocumentLease()
  })

  it('assumes a single tab and allows deletion when Web Locks are unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
    const tab = await openTab()
    expect(await tab.canDeleteDocument(KEY, false)).toBe(true)
    expect(await tab.canDeleteDocument(KEY, true)).toBe(true)
  })

  it('treats omitted lock snapshot lists as empty when probing deletes', async () => {
    const tab = await openTab()
    vi.spyOn(locks, 'query').mockImplementation(async () => ({} as never))
    expect(await tab.canDeleteDocument(KEY, false)).toBe(true)
  })
})
