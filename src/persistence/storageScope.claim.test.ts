import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FakeBroadcastChannel,
  FakeLockManager,
  resetChannelBus,
  settleTabs,
} from '@/test/fakeTabEnvironment'

type ScopeModule = typeof import('./storageScope')

async function loadScopeModule(): Promise<ScopeModule> {
  vi.resetModules()
  return import('./storageScope')
}

describe('claimGuestStorageScope', () => {
  let locks: FakeLockManager
  let session: Map<string, string>

  beforeEach(() => {
    locks = new FakeLockManager()
    session = new Map()
    resetChannelBus()
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true })
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => { session.set(key, value) },
      removeItem: (key: string) => { session.delete(key) },
    } satisfies Partial<Storage>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the same guest scope across a normal reload claim', async () => {
    const first = await loadScopeModule()
    const scope = await first.claimGuestStorageScope()
    expect(scope.startsWith('guest:')).toBe(true)
    first.releaseGuestStorageScopeClaim()

    const reloaded = await loadScopeModule()
    await expect(reloaded.claimGuestStorageScope()).resolves.toBe(scope)
    reloaded.releaseGuestStorageScopeClaim()
  })

  it('mints a fresh scope when a duplicated tab already claimed the cloned one', async () => {
    const owner = await loadScopeModule()
    const original = await owner.claimGuestStorageScope()

    const duplicate = await loadScopeModule()
    const claimed = await duplicate.claimGuestStorageScope()
    await settleTabs()

    expect(claimed.startsWith('guest:')).toBe(true)
    expect(claimed).not.toBe(original)
    expect(owner.getStorageScope()).toBe(original)
    expect(duplicate.getStorageScope()).toBe(claimed)

    owner.releaseGuestStorageScopeClaim()
    duplicate.releaseGuestStorageScopeClaim()
  })

  it('never writes the guest session marker into localStorage', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    } satisfies Partial<Storage>)

    const scope = await loadScopeModule()
    await scope.claimGuestStorageScope()
    expect([...values.keys()].every(key => !key.includes('guest'))).toBe(true)
    scope.releaseGuestStorageScopeClaim()
  })

  it('waits for a macrotask-delayed lock callback instead of assuming busy', async () => {
    // Browser Web Locks may grant via macrotask, not a microtask.
    class DelayedLockManager {
      private held = false

      request(
        name: string,
        options: { mode?: LockMode; ifAvailable?: boolean; signal?: AbortSignal | null },
        callback: (lock: { name: string; mode: LockMode } | null) => Promise<unknown>,
      ): Promise<unknown> {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (this.held && options.ifAvailable) {
              void Promise.resolve(callback(null)).then(resolve, reject)
              return
            }
            this.held = true
            void Promise.resolve(callback({ name, mode: options.mode ?? 'exclusive' }))
              .then(resolve, reject)
              .finally(() => { this.held = false })
          }, 10)
        })
      }
    }

    Object.defineProperty(navigator, 'locks', { value: new DelayedLockManager(), configurable: true })

    const first = await loadScopeModule()
    const scope = await first.claimGuestStorageScope()
    expect(scope.startsWith('guest:')).toBe(true)

    // Concurrent claim must see busy (null lock) while the first grant is held.
    const second = await loadScopeModule()
    const secondScope = await second.claimGuestStorageScope()
    expect(secondScope).not.toBe(scope)

    first.releaseGuestStorageScopeClaim()
    second.releaseGuestStorageScopeClaim()
  })
})
