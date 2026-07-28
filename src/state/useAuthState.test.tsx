import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthState } from './useAuthState'

const authApi = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/api/auth.api', () => authApi)
vi.mock('@/api/client', () => ({
  API_BASE_URL: '/api',
  setAuthErrorHandler: vi.fn(),
}))

describe('useAuthState guest sessions', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } satisfies Partial<Storage>)
    vi.clearAllMocks()
    authApi.checkAuth.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores an explicitly started guest session after remounting', async () => {
    const firstMount = renderHook(() => useAuthState())

    act(() => {
      firstMount.result.current.continueAsGuest()
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
  })

  it('removes the persisted guest session when leaving', () => {
    const { result } = renderHook(() => useAuthState())

    act(() => {
      result.current.continueAsGuest()
      result.current.leaveGuest()
    })

    expect(globalThis.localStorage.getItem('table-canvas:guest-session')).toBeNull()
  })
})
