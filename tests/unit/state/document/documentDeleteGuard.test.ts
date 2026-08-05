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

describe('document delete guards', () => {
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

  it('holds an exclusive presence guard through an active project delete', async () => {
    const tab = await openTab()
    tab.startDocumentLease({ key: KEY })
    await settleTabs()
    const action = vi.fn(async () => {
      expect(locks.isHeld(openName(KEY))).toBe(true)
      expect(locks.holderCount(openName(KEY))).toBe(1)
      expect(locks.isHeld(leaseName(KEY))).toBe(true)
      return 'deleted'
    })

    const result = await tab.withActiveDocumentDeleteGuard(KEY, action)

    expect(result).toEqual({ acquired: true, value: 'deleted' })
    expect(action).toHaveBeenCalledOnce()
    expect(locks.isHeld(leaseName(KEY))).toBe(true)
    tab.stopDocumentLease()
  })

  it('propagates errors from the guarded action instead of masking them as unavailable', async () => {
    const tab = await openTab()
    tab.startDocumentLease({ key: KEY })
    await settleTabs()
    const action = vi.fn(async () => {
      throw new Error('save failed')
    })

    await expect(tab.withActiveDocumentDeleteGuard(KEY, action)).rejects.toThrow('save failed')
    expect(action).toHaveBeenCalledOnce()

    await settleTabs()
    expect(locks.holderCount(openName(KEY))).toBe(1)
    tab.stopDocumentLease()
  })

  it('still fails closed and does not run the action when the lock probe itself throws', async () => {
    const tab = await openTab()
    tab.startDocumentLease({ key: KEY })
    await settleTabs()
    const action = vi.fn()
    vi.spyOn(locks, 'request').mockImplementationOnce(() => {
      throw new Error('Web Locks unavailable')
    })

    const result = await tab.withActiveDocumentDeleteGuard(KEY, action)

    expect(result).toEqual({ acquired: false })
    expect(action).not.toHaveBeenCalled()

    await settleTabs()
    expect(locks.holderCount(openName(KEY))).toBe(1)
    tab.stopDocumentLease()
  })

  it('refuses an active delete while another tab is open', async () => {
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    await settleTabs()
    const follower = await openTab()
    follower.startDocumentLease({ key: KEY })
    await settleTabs()
    const action = vi.fn()

    const result = await owner.withActiveDocumentDeleteGuard(KEY, action)

    expect(result).toEqual({ acquired: false })
    expect(action).not.toHaveBeenCalled()
    owner.stopDocumentLease()
    follower.stopDocumentLease()
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

  it('blocks cross-tab deletion through presence messages when Web Locks are unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
    const owner = await openTab()
    owner.startDocumentLease({ key: KEY })
    const other = await openTab()
    const action = vi.fn()

    expect(await other.canDeleteDocument(KEY, false)).toBe(false)
    expect(await other.withInactiveDocumentDeleteGuard(KEY, action)).toEqual({
      acquired: false,
    })
    expect(action).not.toHaveBeenCalled()
    owner.stopDocumentLease()
  })

  it('treats omitted lock snapshot lists as empty when probing deletes', async () => {
    const tab = await openTab()
    vi.spyOn(locks, 'query').mockImplementation(async () => ({} as never))
    expect(await tab.canDeleteDocument(KEY, false)).toBe(true)
  })
})
