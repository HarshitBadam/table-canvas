import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LoginCredentials } from '@/api/auth.api'
import { formatApiErrorMessage } from '@/api/client'
import {
  fetchProjects,
  flushAllProjectSavesWithSync,
  setProjectSyncErrorHandler,
  syncOfflineAccountProjects,
} from '@/persistence/syncService'
import { getDependentNodeIds } from '@/engine/workflowGraph'
import { dropEngineTables } from '@/engine/engineTableCleanup'
import { useReportStore } from '@/report/reportStore'
import type { LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { useProjectStore } from './projectStore'
import { useDataStore } from './dataStore'
import { useAuthState } from './useAuthState'
import {
  clearProjectRuntime,
  initializeEngine,
  loadOrCreateProject,
} from './projectLifecycle'
import {
  AppContext, type AppContextValue, type AppProviderState, type AppPhase,
} from './appContextValue'
import { useProjectActions } from './useProjectActions'
import { prepareProjectState } from './projectPreparation'
import { usePersistenceLifecycle } from './usePersistenceLifecycle'
import { requestedDocumentProjectId, useDocumentSession } from './useDocumentSession'
import { useDocumentCoordination } from './useDocumentCoordination'
import { useProjectAutosave } from './useProjectAutosave'
import { useBackgroundTableRefresh } from './useBackgroundTableRefresh'
import { useProjectActivityTracking } from './useProjectActivityTracking'
import { getStorageScope } from '@/persistence/storageScope'
import { clearWorkspaceViews } from '@/layout/workspaceViewPersistence'
import { clearAllProjectActivity } from '@/layout/projectActivity'
import {
  bindProjectCatalog,
  publishCatalogChanged,
  subscribeProjectCatalog,
  type ProjectCatalogEvent,
} from '@/persistence/projectCatalog'

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

const PHASE_MESSAGES: Record<AppPhase, string> = {
  idle: 'Starting...',
  initializing_engine: 'Starting data engine...',
  checking_auth: 'Checking authentication...',
  loading_project: 'Loading your project...',
  ready: 'Ready',
  error: 'Something went wrong',
}
export function AppProvider({ children }: { children: ReactNode }) {
  const {
    user,
    isAuthenticated,
    performCheckAuth,
    performLogin,
    performGoogleLogin,
    performLogout,
    continueAsGuest: setGuestAuth,
    leaveGuest: clearGuestAuth,
  } = useAuthState()
  const [projectLimitViolation, setProjectLimitViolation] =
    useState<LimitExceeded | null>(null)
  const [state, setState] = useState<AppProviderState>({
    phase: 'idle',
    phaseMessage: PHASE_MESSAGES.idle,
    engineReady: false,
    user: null,
    isAuthenticated: false,
    projectId: null,
    projectName: 'Untitled Project',
    projects: [],
    isSaving: false,
    isProjectOperationPending: false,
    error: null,
    syncError: null,
  })
  const initialized = useRef(false)
  const {
    saveLatestProject,
    flushLocalProjectSave,
    flushImportProjectSave,
    flushProjectSave,
  } = useProjectAutosave({
    phase: state.phase,
    isAuthenticated: state.isAuthenticated,
    projectId: state.projectId,
    setState,
  })
  useBackgroundTableRefresh(state.phase === 'ready' && state.engineReady)
  useProjectActivityTracking()
  const setPhase = useCallback((phase: AppPhase, error?: string) => {
    setState(previous => ({
      ...previous,
      phase,
      phaseMessage: error || PHASE_MESSAGES[phase],
      error: phase === 'error' ? error || 'Unknown error' : null,
    }))
  }, [])
  const prepareProject = useCallback(prepareProjectState, [])
  const clearActiveWorkspace = useCallback(async () => {
    await clearProjectRuntime(useProjectStore.getState().nodes)
    useProjectStore.setState({
      projectId: '',
      projectName: 'Untitled Project',
      nodes: {},
      edges: {},
      patches: {},
      selectedNodeId: null,
    })
    useDataStore.setState({ tableData: {} })
    useReportStore.getState().reset()
  }, [])
  const resetWorkspace = useCallback(async () => {
    await clearActiveWorkspace()
    setState(previous => ({
      ...previous,
      projectId: null,
      projectName: 'Untitled Project',
      projects: [],
    }))
  }, [clearActiveWorkspace])
  const documentIdentity = useDocumentSession({
    projectId: state.projectId,
    authToken: `${user?.id ?? 'none'}:${user?.tier ?? 'none'}`,
  })
  // Bind presence/lease as soon as a project id exists — not only after phase
  // becomes ready — so a peer tab cannot delete during the load window.
  useDocumentCoordination({
    identity: documentIdentity,
  })
  usePersistenceLifecycle({
    user,
    saveLatestProject,
    prepareProject,
    setState,
  })
  useEffect(() => {
    setState(previous => ({ ...previous, user, isAuthenticated }))
    if (!isAuthenticated && useProjectStore.getState().projectId) {
      void resetWorkspace()
    }
  }, [user, isAuthenticated, resetWorkspace])

  useEffect(() => {
    setProjectSyncErrorHandler?.(message => {
      setState(previous => ({ ...previous, syncError: message }))
    })
    return () => setProjectSyncErrorHandler?.(null)
  }, [])

  useEffect(() => {
    // Wait until boot/login has finished loading a project. Running reconcile
    // while phase is still briefly 'ready' before postLoginSetup flips it to
    // loading_project races getDB() against the login path.
    if (!state.isAuthenticated || state.phase !== 'ready' || !initialized.current) return
    // Skip the first ready paint that happens before initialize() finishes —
    // initialize sets ready only after the first project load.
    if (!state.engineReady) return
    const scope = getStorageScope()
    const stopBinding = bindProjectCatalog(scope)
    let stopped = false
    let generation = 0

    const reconcileCatalog = async (event?: ProjectCatalogEvent) => {
      const requestGeneration = ++generation
      try {
        const projects = await fetchProjects()
        if (stopped || requestGeneration !== generation) return
        const storeProjectId = useProjectStore.getState().projectId
        const activeProjectId = storeProjectId || null
        const deletedActive = Boolean(
          activeProjectId
          && (
            (event?.type === 'project-deleted' && event.projectId === activeProjectId)
            || !projects.some(project => project.id === activeProjectId)
          ),
        )
        if (deletedActive) {
          setState(previous => ({
            ...previous,
            projectId: null,
            projectName: 'Untitled Project',
            projects,
            isProjectOperationPending: true,
            syncError: 'This project was deleted in another tab.',
          }))
          await clearActiveWorkspace()
          if (stopped || requestGeneration !== generation) return
          setState(previous => ({
            ...previous,
            projectId: null,
            projectName: 'Untitled Project',
            projects,
            isProjectOperationPending: false,
          }))
          return
        }
        setState(previous => ({ ...previous, projects }))
      } catch (error) {
        console.error('[AppContext] Failed to reconcile the project catalog:', error)
      }
    }

    const unsubscribe = subscribeProjectCatalog(event => {
      void reconcileCatalog(event)
    })
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void reconcileCatalog()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      stopped = true
      generation += 1
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      unsubscribe()
      stopBinding()
    }
  }, [
    clearActiveWorkspace,
    state.engineReady,
    state.isAuthenticated,
    state.phase,
    user?.id,
  ])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function initialize() {
      try {
        setPhase('initializing_engine')
        await initializeEngine()
        setState(previous => ({ ...previous, engineReady: true }))
        setPhase('checking_auth')
        const authResult = await performCheckAuth()
        if (!authResult.shouldContinue || !authResult.user) {
          setState(previous => ({
            ...previous,
            user: null,
            isAuthenticated: false,
          }))
          setPhase('ready')
          return
        }
        setState(previous => ({
          ...previous,
          user: authResult.user,
          isAuthenticated: true,
        }))
        if (authResult.user.tier !== 'guest') {
          try {
            await syncOfflineAccountProjects()
            await flushAllProjectSavesWithSync()
          } catch (error) {
            console.error('[AppContext] Startup project sync failed:', error)
            setState(previous => ({
              ...previous,
              syncError: formatApiErrorMessage(error, 'Project sync failed'),
            }))
          }
        }

        setPhase('loading_project')
        const { project, projectList } = await loadOrCreateProject(
          requestedDocumentProjectId(),
        )
        if (project) await prepareProject(project)
        setState(previous => ({
          ...previous,
          projectId: project?.id ?? null,
          projectName: project?.name ?? 'Untitled Project',
          projects: projectList,
        }))
        setPhase('ready')
      } catch (error) {
        setPhase('error', formatApiErrorMessage(error, 'Initialization failed'))
      }
    }

    void initialize()
  }, [performCheckAuth, prepareProject, setPhase])

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
  }, [clearActiveWorkspace, prepareProject, setPhase])

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
  }, [postLoginSetup, setPhase])

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

  const {
    createNewProject,
    deleteProject,
    duplicateActiveProject,
    importProject,
    loadProject,
  } = useProjectActions({
    state,
    setState,
    tier: user?.tier ?? 'guest',
    flushProjectSave,
    prepareProject,
    clearActiveWorkspace,
    setProjectLimitViolation,
  })

  const renameProject = useCallback((name: string) => {
    const nextName = name.trim()
    if (!nextName || !state.projectId) return

    useProjectStore.setState({ projectName: nextName })
    setState(previous => ({
      ...previous,
      projectName: nextName,
      projects: previous.projects.map(project => (
        project.id === previous.projectId
          ? { ...project, name: nextName, updatedAt: new Date() }
          : project
      )),
    }))
    void flushLocalProjectSave()
      .then(() => publishCatalogChanged())
      .catch(error => {
        console.error('[AppContext] Failed to persist project rename:', error)
      })
  }, [flushLocalProjectSave, state.projectId])

  const refreshProjects = useCallback(async () => {
    try {
      const projects = await fetchProjects()
      setState(previous => ({ ...previous, projects }))
    } catch (error) {
      console.error('[AppContext] Failed to refresh project list:', error)
    }
  }, [])

  const deleteNodeWithSync = useCallback(async (nodeId: string) => {
    const project = useProjectStore.getState()
    const node = project.nodes[nodeId]
    if (!node) return
    const nodeIds = [
      nodeId,
      ...getDependentNodeIds(project.nodes, project.edges, nodeId),
    ]
    project.deleteNode(nodeId)
    for (const id of nodeIds) {
      useDataStore.getState().clearTableData(id)
    }
    await dropEngineTables(nodeIds, { onlyIfDeleted: true })
  }, [])

  const persistProjectNow = useCallback(async () => {
    await flushImportProjectSave()
    await useReportStore.getState().flushSaves()
  }, [flushImportProjectSave])

  const value: AppContextValue = {
    ...state,
    isReady: state.phase === 'ready',
    isLoading: state.phase !== 'ready' && state.phase !== 'error',
    login,
    googleLogin,
    continueAsGuest,
    leaveGuest,
    logout,
    createNewProject,
    duplicateActiveProject,
    deleteProject,
    importProject,
    loadProject,
    renameProject,
    refreshProjects,
    deleteNodeWithSync,
    persistProjectNow,
    projectLimitViolation,
    setProjectLimitViolation,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
