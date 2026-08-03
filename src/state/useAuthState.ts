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
import {
  accountStorageScope,
  claimGuestStorageScope,
  releaseGuestStorageScopeClaim,
  setStorageScope,
} from '@/persistence/storageScope'

const LOCAL_USER: User = {
  id: 'local-user',
  email: 'local@tablecanvas.app',
  name: 'Local User',
  tier: 'guest',
  createdAt: new Date(0),
}

const GUEST_SESSION_KEY = 'table-canvas:guest-session'

function hasGuestSession(): boolean {
  try {
    return sessionStorage.getItem(GUEST_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

function setGuestSession(active: boolean): void {
  try {
    if (active) {
      sessionStorage.setItem(GUEST_SESSION_KEY, 'true')
    } else {
      sessionStorage.removeItem(GUEST_SESSION_KEY)
    }
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleAuthError = useCallback(() => {
    setGuestSession(false)
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  useEffect(() => {
    setAuthErrorHandler(handleAuthError)
    return () => setAuthErrorHandler(null)
  }, [handleAuthError])

  const performLogin = useCallback(async (credentials: LoginCredentials) => {
    const { user } = await apiLogin(credentials)
    setGuestSession(false)
    releaseGuestStorageScopeClaim()
    setStorageScope(accountStorageScope(user.id))
    setUser(user)
    setIsAuthenticated(true)
    return user
  }, [])

  const performGoogleLogin = useCallback(async (credential: string) => {
    const { user } = await apiLoginWithGoogle(credential)
    setGuestSession(false)
    releaseGuestStorageScopeClaim()
    setStorageScope(accountStorageScope(user.id))
    setUser(user)
    setIsAuthenticated(true)
    return user
  }, [])

  const performLogout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      // Ending the local session must not depend on network availability. The
      // server-side refresh token will be revoked on a successful request or expire.
      setGuestSession(false)
      releaseGuestStorageScopeClaim()
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
    // A guest choice belongs to this tab. Shared account cookies created by another
    // tab must not silently replace its isolated guest workspace on reload.
    let authedUser = hasGuestSession() ? LOCAL_USER : await checkAuth()

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
        const allowAutomaticLocalMode = import.meta.env.DEV
          || import.meta.env.VITE_AUTO_GUEST === 'true'
        if (!allowAutomaticLocalMode) {
          setUser(null)
          setIsAuthenticated(false)
          return { user: null, shouldContinue: false }
        }
        authedUser = LOCAL_USER
      } else {
        setUser(null)
        setIsAuthenticated(false)
        return { user: null, shouldContinue: false }
      }
    }

    if (authedUser.tier === 'guest') {
      await claimGuestStorageScope()
    } else {
      releaseGuestStorageScopeClaim()
      setStorageScope(accountStorageScope(authedUser.id))
    }
    setUser(authedUser)
    setIsAuthenticated(true)
    return { user: authedUser, shouldContinue: true }
  }, [])

  const continueAsGuest = useCallback(async (): Promise<User> => {
    setGuestSession(true)
    await claimGuestStorageScope()
    setUser(LOCAL_USER)
    setIsAuthenticated(true)
    return LOCAL_USER
  }, [])

  const leaveGuest = useCallback(() => {
    setGuestSession(false)
    releaseGuestStorageScopeClaim()
    setUser(null)
    setIsAuthenticated(false)
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
    continueAsGuest,
    leaveGuest,
  }
}
