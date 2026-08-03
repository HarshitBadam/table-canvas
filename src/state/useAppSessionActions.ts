import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { LoginCredentials, User } from '@/api/auth.api'
import { formatApiErrorMessage } from '@/api/client'
import {
  flushAllProjectSavesWithSync,
  syncOfflineAccountProjects,
} from '@/persistence/syncService'
import { getStorageScope } from '@/persistence/storageScope'
import { clearWorkspaceViews } from '@/layout/workspaceViewPersistence'
import { clearAllProjectActivity } from '@/layout/projectActivity'
import { useReportStore } from '@/report/reportStore'
import type { ProjectWithSync } from '@/persistence/projectSync'
import type { Tier } from '@/shared/limits'
import { loadOrCreateProject } from './projectLifecycle'
import type { AppPhase, AppProviderState } from './appContextValue'

const LOCAL_EXIT_TIMEOUT_MS = 3_000

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Local save timed out.')),
          milliseconds,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface Options {
  user: User | null
  setState: Dispatch<SetStateAction<AppProviderState>>
  setPhase: (phase: AppPhase, error?: string) => void
  prepareProject: (project: ProjectWithSync) => Promise<void>
  clearActiveWorkspace: () => Promise<void>
  resetWorkspace: () => Promise<void>
  flushLocalProjectSave: () => Promise<void>
  performLogin: (credentials: LoginCredentials) => Promise<User>
  performGoogleLogin: (credential: string) => Promise<User>
  performLogout: () => Promise<void>
  setGuestAuth: () => Promise<User>
  clearGuestAuth: () => void
}

export function useAppSessionActions({
  user,
  setState,
  setPhase,
  prepareProject,
  clearActiveWorkspace,
  resetWorkspace,
  flushLocalProjectSave,
  performLogin,
  performGoogleLogin,
  performLogout,
  setGuestAuth,
  clearGuestAuth,
}: Options) {
  const postLoginSetup = useCallback(async (tier: Tier) => {
    setPhase('loading_project')
    clearWorkspaceViews(getStorageScope())
    if (tier !== 'guest') {
      try {
        await syncOfflineAccountProjects()
        await flushAllProjectSavesWithSync()
      } catch (error) {
        console.error('[AppContext] Post-login project sync failed:', error)
        setState(previous => ({
          ...previous,
          syncError: formatApiErrorMessage(error, 'Project sync failed'),
        }))
      }
    }
    const { project, projectList } = await loadOrCreateProject()
    if (project) {
      await prepareProject(project)
    } else {
      await clearActiveWorkspace()
    }
    setState(previous => ({
      ...previous,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'Untitled Project',
      projects: projectList,
    }))
    setPhase('ready')
  }, [clearActiveWorkspace, prepareProject, setPhase, setState])

  // postLoginSetup flips the phase to 'loading_project'. If it throws, the phase
  // must be put back into a rendered state (rather than left stuck showing the
  // full-screen loader forever) so the caller's own error handling can recover.
  const runPostLoginSetup = useCallback(async (tier: Tier) => {
    try {
      await postLoginSetup(tier)
    } catch (error) {
      setState(previous => ({
        ...previous,
        syncError: formatApiErrorMessage(error, 'Could not load your project'),
      }))
      setPhase('ready')
      throw error
    }
  }, [postLoginSetup, setPhase, setState])

  const beginLoginSetup = useCallback(async (enter: () => Promise<{ tier: Tier }>) => {
    // Leave phase 'ready' before auth flips isAuthenticated, otherwise the
    // catalog reconcile effect races getDB() against post-login project load.
    setPhase('loading_project')
    try {
      const loggedInUser = await enter()
      await runPostLoginSetup(loggedInUser.tier)
    } catch (error) {
      setPhase('ready')
      throw error
    }
  }, [runPostLoginSetup, setPhase])

  const login = useCallback(async (credentials: LoginCredentials) => {
    await beginLoginSetup(() => performLogin(credentials))
  }, [beginLoginSetup, performLogin])

  const googleLogin = useCallback(async (credential: string) => {
    await beginLoginSetup(() => performGoogleLogin(credential))
  }, [beginLoginSetup, performGoogleLogin])

  const continueAsGuest = useCallback(async () => {
    await beginLoginSetup(() => setGuestAuth())
  }, [beginLoginSetup, setGuestAuth])

  const leaveGuest = useCallback(async () => {
    if (user?.tier !== 'guest') return
    try {
      await within(Promise.all([
        flushLocalProjectSave(),
        useReportStore.getState().flushSaves(),
      ]), LOCAL_EXIT_TIMEOUT_MS)
    } catch (error) {
      console.warn('[AppContext] Guest workspace save did not finish before exit:', error)
    } finally {
      clearWorkspaceViews(getStorageScope())
      clearAllProjectActivity(getStorageScope())
      clearGuestAuth()
      await resetWorkspace()
    }
  }, [clearGuestAuth, flushLocalProjectSave, resetWorkspace, user?.tier])

  const logout = useCallback(async () => {
    try {
      await within(Promise.all([
        flushLocalProjectSave(),
        useReportStore.getState().flushSaves(),
      ]), LOCAL_EXIT_TIMEOUT_MS)
    } catch (error) {
      // Account-scoped IndexedDB and its outbox remain isolated for the next
      // sign-in. A persistence failure must never trap the user in the session.
      console.warn('[AppContext] Local save did not finish before sign out:', error)
    }
    clearWorkspaceViews(getStorageScope())
    clearAllProjectActivity(getStorageScope())
    try {
      await performLogout()
    } catch (error) {
      // performLogout clears local auth state in a finally block. A failed revoke
      // can be retried only by the server and must not block local sign-out.
      console.warn('[AppContext] Remote session revoke failed during sign out:', error)
    } finally {
      await resetWorkspace()
    }
  }, [flushLocalProjectSave, performLogout, resetWorkspace])

  return {
    login,
    googleLogin,
    continueAsGuest,
    leaveGuest,
    logout,
  }
}
