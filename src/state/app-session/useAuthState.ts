import { useState, useCallback, useEffect } from 'react'
import {
  checkAuth,
  login as apiLogin,
  loginWithGoogle as apiLoginWithGoogle,
  logout as apiLogout,
  LoginCredentials,
  User,
} from '@/api/auth.api'
import { setAuthErrorHandler } from '@/api/client'
import { migrateLegacyGuestData } from '@/persistence/storage/legacyGuestMigration'
import {
  accountStorageScope,
  claimGuestStorageScope,
  releaseGuestStorageScopeClaim,
  resetLoggedOutStorageScope,
  setStorageScope,
} from '@/persistence/storage/storageScope'

const LOCAL_USER: User = {
  id: 'local-user',
  email: 'local@tablecanvas.app',
  name: 'Local User',
  tier: 'guest',
  createdAt: new Date(0),
}

const GUEST_SESSION_KEY = 'table-canvas:guest-session'
const ACCOUNT_SIGNED_OUT_KEY = 'table-canvas:account-signed-out'

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

function hasTabLocalAccountSignOut(): boolean {
  try {
    return sessionStorage.getItem(ACCOUNT_SIGNED_OUT_KEY) === 'true'
  } catch {
    return false
  }
}

function setTabLocalAccountSignOut(active: boolean): void {
  try {
    if (active) {
      sessionStorage.setItem(ACCOUNT_SIGNED_OUT_KEY, 'true')
    } else {
      sessionStorage.removeItem(ACCOUNT_SIGNED_OUT_KEY)
    }
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleAuthError = useCallback(() => {
    // Guest tabs ignore account 401s — another tab's logout must not tear down
    // an isolated guest workspace mid-session or mid "Continue as guest".
    if (hasGuestSession()) return
    resetLoggedOutStorageScope()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  useEffect(() => {
    setAuthErrorHandler(handleAuthError)
    return () => setAuthErrorHandler(null)
  }, [handleAuthError])

  const performLogin = useCallback(async (credentials: LoginCredentials) => {
    const { user } = await apiLogin(credentials)
    setTabLocalAccountSignOut(false)
    setGuestSession(false)
    releaseGuestStorageScopeClaim()
    setStorageScope(accountStorageScope(user.id))
    setUser(user)
    setIsAuthenticated(true)
    return user
  }, [])

  const performGoogleLogin = useCallback(async (credential: string) => {
    const { user } = await apiLoginWithGoogle(credential)
    setTabLocalAccountSignOut(false)
    setGuestSession(false)
    releaseGuestStorageScopeClaim()
    setStorageScope(accountStorageScope(user.id))
    setUser(user)
    setIsAuthenticated(true)
    return user
  }, [])

  const performLogout = useCallback(async () => {
    let remoteError: unknown
    try {
      await apiLogout()
    } catch (error) {
      remoteError = error
    } finally {
      setTabLocalAccountSignOut(true)
      setGuestSession(false)
      resetLoggedOutStorageScope()
      setUser(null)
      setIsAuthenticated(false)
    }
    if (remoteError) throw remoteError
  }, [])

  const performCheckAuth = useCallback(async (): Promise<{
    user: User | null
    shouldContinue: boolean
  }> => {
    if (hasTabLocalAccountSignOut() && !hasGuestSession()) {
      resetLoggedOutStorageScope()
      setUser(null)
      setIsAuthenticated(false)
      return { user: null, shouldContinue: false }
    }

    // Guest choice is tab-local; shared account cookies from another tab must not
    // replace this tab's isolated guest workspace on reload.
    const guestSession = hasGuestSession()
    const authResult = guestSession
      ? { user: LOCAL_USER, backendReachable: true }
      : await checkAuth()
    let authedUser = authResult.user

    if (!authedUser) {
      if (!authResult.backendReachable) {
        const allowAutomaticLocalMode = import.meta.env.DEV
          || import.meta.env.VITE_AUTO_GUEST === 'true'
        if (!allowAutomaticLocalMode) {
          resetLoggedOutStorageScope()
          setUser(null)
          setIsAuthenticated(false)
          return { user: null, shouldContinue: false }
        }
        authedUser = LOCAL_USER
      } else {
        resetLoggedOutStorageScope()
        setUser(null)
        setIsAuthenticated(false)
        return { user: null, shouldContinue: false }
      }
    }

    if (authedUser.tier === 'guest') {
      const scope = await claimGuestStorageScope()
      // Fire-and-forget: IndexedDB must never gate reaching the workspace.
      void migrateLegacyGuestData(scope)
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
    const scope = await claimGuestStorageScope()
    // Fire-and-forget: IndexedDB must never gate reaching the workspace.
    void migrateLegacyGuestData(scope)
    setUser(LOCAL_USER)
    setIsAuthenticated(true)
    return LOCAL_USER
  }, [])

  const leaveGuest = useCallback(() => {
    setGuestSession(false)
    resetLoggedOutStorageScope()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  return {
    user,
    isAuthenticated,
    performLogin,
    performGoogleLogin,
    performLogout,
    performCheckAuth,
    continueAsGuest,
    leaveGuest,
  }
}
