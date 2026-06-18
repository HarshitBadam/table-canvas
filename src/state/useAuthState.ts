import { useState, useCallback, useEffect } from 'react'
import {
  checkAuth,
  logout as apiLogout,
  login as apiLogin,
  loginWithGoogle as apiLoginWithGoogle,
  LoginCredentials,
  User,
} from '@/api/auth.api'
import { setAuthErrorHandler, API_BASE_URL } from '@/api/client'

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleAuthError = useCallback(() => {
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  useEffect(() => {
    setAuthErrorHandler(handleAuthError)
  }, [handleAuthError])

  const performLogin = useCallback(async (credentials: LoginCredentials) => {
    const { user } = await apiLogin(credentials)
    setUser(user)
    setIsAuthenticated(true)
    return user
  }, [])

  const performGoogleLogin = useCallback(async (credential: string) => {
    const { user } = await apiLoginWithGoogle(credential)
    setUser(user)
    setIsAuthenticated(true)
    return user
  }, [])

  const performLogout = useCallback(async () => {
    try { await apiLogout() } catch (error) { console.error('[useAuthState] Logout request failed:', error); } finally {
      setUser(null)
      setIsAuthenticated(false)
    }
  }, [])

  /**
   * Checks authentication status with the backend.
   * Returns the authenticated user and whether init should proceed to project loading.
   * Falls back to a local user when the backend is unreachable.
   */
  const performCheckAuth = useCallback(async (): Promise<{
    user: User | null
    shouldContinue: boolean
  }> => {
    let authedUser = await checkAuth()

    if (!authedUser) {
      let backendReachable = false

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        backendReachable = true

        if (response.status === 401) {
          setUser(null)
          setIsAuthenticated(false)
          return { user: null, shouldContinue: false }
        }
      } catch (error) {
        console.error('[useAuthState] Backend reachability check failed:', error);
        backendReachable = false
      }

      if (!backendReachable) {
        authedUser = {
          id: 'local-user',
          email: 'local@tablecanvas.app',
          name: 'Local User',
          tier: 'guest',
          createdAt: new Date(),
        }
      } else {
        setUser(null)
        setIsAuthenticated(false)
        return { user: null, shouldContinue: false }
      }
    }

    setUser(authedUser)
    setIsAuthenticated(true)
    return { user: authedUser, shouldContinue: true }
  }, [])

  return {
    user,
    isAuthenticated,
    setUser,
    setIsAuthenticated,
    performLogin,
    performGoogleLogin,
    performLogout,
    performCheckAuth,
  }
}
