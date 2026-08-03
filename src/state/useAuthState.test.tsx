import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthState } from './useAuthState'

const authApi = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
}))

vi.mock('@/api/auth.api', () => authApi)
vi.mock('@/api/client', () => ({
  API_BASE_URL: '/api',
  setAuthErrorHandler: vi.fn(),
}))

function stubWebStorage() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } satisfies Partial<Storage>
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  } satisfies Partial<Storage>)
  return values
}

describe('useAuthState guest sessions', () => {
  beforeEach(() => {
    stubWebStorage()
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
    })
    vi.clearAllMocks()
    authApi.checkAuth.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores an explicitly started guest session after remounting', async () => {
    const firstMount = renderHook(() => useAuthState())

    await act(async () => {
      await firstMount.result.current.continueAsGuest()
    })
    firstMount.unmount()

    const secondMount = renderHook(() => useAuthState())
    await act(async () => {
      const authResult = await secondMount.result.current.performCheckAuth()
      expect(authResult).toMatchObject({
        shouldContinue: true,
        user: { id: 'local-user', tier: 'guest' },
      })
    })

    expect(secondMount.result.current.isAuthenticated).toBe(true)
    expect(globalThis.localStorage.getItem('table-canvas:guest-session')).toBeNull()
  })

  it('keeps the guest choice in sessionStorage, not localStorage', async () => {
    const session = stubWebStorage()
    const { result } = renderHook(() => useAuthState())

    await act(async () => {
      await result.current.continueAsGuest()
    })

    expect(session.get('table-canvas:guest-session')).toBe('true')
    expect(globalThis.localStorage.getItem('table-canvas:guest-session')).toBeNull()
  })

  it('removes the guest session when leaving', async () => {
    const session = stubWebStorage()
    const { result } = renderHook(() => useAuthState())

    await act(async () => {
      await result.current.continueAsGuest()
      result.current.leaveGuest()
    })

    expect(session.get('table-canvas:guest-session')).toBeUndefined()
  })

  it('does not let an account cookie replace an active guest tab', async () => {
    authApi.checkAuth.mockResolvedValue({
      id: 'account-user',
      email: 'user@example.com',
      tier: 'google',
    })
    const { result } = renderHook(() => useAuthState())

    await act(async () => {
      await result.current.continueAsGuest()
    })
    await act(async () => {
      const authResult = await result.current.performCheckAuth()
      expect(authResult.user).toMatchObject({ id: 'local-user', tier: 'guest' })
    })
    expect(authApi.checkAuth).not.toHaveBeenCalled()
  })
})
