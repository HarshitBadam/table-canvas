import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LoginCredentials } from '@/api/auth.api'
import {
  fetchProjects,
  flushAllProjectSavesWithSync,
  flushProjectSaveWithSync,
  saveProjectWithSync,
  setProjectSyncErrorHandler,
  syncLocalProjectsToBackend,
} from '@/persistence/syncService'
import {
  isRetryableRemoteDeferral,
} from '@/persistence/projectSync'
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
  const saveInFlight = useRef<Promise<void> | null>(null)
  const savePending = useRef(false)
  const nodes = useProjectStore(store => store.nodes)
  const edges = useProjectStore(store => store.edges)
  const patches = useProjectStore(store => store.patches)
  const projectName = useProjectStore(store => store.projectName)
  const saveLatestProject = useCallback(async () => {
    if (saveInFlight.current) {
      savePending.current = true
      await saveInFlight.current
      return
    }

    const save = async () => {
      setState(previous => ({ ...previous, isSaving: true }))
      try {
        do {
          savePending.current = false
          const project = useProjectStore.getState()
          if (!project.projectId) break
          await saveProjectWithSync(
            project.projectId,
            project.projectName,
            project.nodes,
            project.edges,
            project.patches,
            useReportStore.getState().reports,
          )
        } while (savePending.current)
      } finally {
        setState(previous => ({ ...previous, isSaving: false }))
      }
    }
    const inFlight = save()
    saveInFlight.current = inFlight
    try {
      await inFlight
    } finally {
      if (saveInFlight.current === inFlight) saveInFlight.current = null
    }
  }, [])
  const flushProjectSave = useCallback(async () => {
    await saveLatestProject()
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    try {
      await flushProjectSaveWithSync(projectId)
    } catch (error) {
      if (!isRetryableRemoteDeferral(error)) throw error
      console.warn('[AppContext] Retryable remote save deferred:', error)
    }
  }, [saveLatestProject])
  const setPhase = useCallback((phase: AppPhase, error?: string) => {
    setState(previous => ({
      ...previous,
      phase,
      phaseMessage: error || PHASE_MESSAGES[phase],
      error: phase === 'error' ? error || 'Unknown error' : null,
    }))
  }, [])
  const prepareProject = useCallback(prepareProjectState, [])
  const resetWorkspace = useCallback(async () => {
    await clearProjectRuntime(useProjectStore.getState().nodes)
    setState(previous => ({
      ...previous,
      projectId: null,
      projectName: 'Untitled Project',
      projects: [],
    }))
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
  usePersistenceLifecycle({
    user,
    flushProjectSave,
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
          setPhase('ready')
          return
        }
        if (authResult.user.tier !== 'guest') {
          await syncLocalProjectsToBackend()
          await flushAllProjectSavesWithSync()
        }

        setPhase('loading_project')
        const { project, projectList } = await loadOrCreateProject()
        await prepareProject(project)
        setState(previous => ({
          ...previous,
          projectId: project.id,
          projectName: project.name,
          projects: projectList.length > 0
            ? projectList
            : [{
                id: project.id,
                name: project.name,
                updatedAt: new Date(),
                createdAt: new Date(),
              }],
        }))
        setPhase('ready')
      } catch (error) {
        setPhase('error', error instanceof Error ? error.message : 'Initialization failed')
      }
    }

    void initialize()
  }, [performCheckAuth, prepareProject, setPhase])

  useEffect(() => {
    if (state.phase !== 'ready' || !state.isAuthenticated || !state.projectId) return
    void saveLatestProject().catch((error) => {
      console.error('[AppContext] Auto-save failed:', error)
    })
  }, [
    edges,
    nodes,
    patches,
    projectName,
    state.isAuthenticated,
    state.phase,
    state.projectId,
    saveLatestProject,
  ])

  useEffect(() => {
    const store = useReportStore as typeof useReportStore & {
      subscribe?: (listener: (state: ReturnType<typeof useReportStore.getState>) => void) => () => void
    }
    if (typeof store.subscribe !== 'function') return
    let previousReports = store.getState().reports
    return store.subscribe(reportState => {
      if (reportState.reports === previousReports) return
      previousReports = reportState.reports
      void saveLatestProject().catch(error => {
        console.error('[AppContext] Report sync failed:', error)
      })
    })
  }, [saveLatestProject])

  const postLoginSetup = useCallback(async (tier: Tier) => {
    setPhase('loading_project')
    if (tier !== 'guest') {
      await syncLocalProjectsToBackend()
      await flushAllProjectSavesWithSync()
    }
    const { project, projectList } = await loadOrCreateProject()
    await prepareProject(project)
    setState(previous => ({
      ...previous,
      projectId: project.id,
      projectName: project.name,
      projects: projectList.length > 0
        ? projectList
        : [{
            id: project.id,
            name: project.name,
            updatedAt: new Date(),
            createdAt: new Date(),
          }],
    }))
    setPhase('ready')
  }, [prepareProject, setPhase])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const loggedInUser = await performLogin(credentials)
    await postLoginSetup(loggedInUser.tier)
  }, [performLogin, postLoginSetup])

  const googleLogin = useCallback(async (credential: string) => {
    const loggedInUser = await performGoogleLogin(credential)
    await postLoginSetup(loggedInUser.tier)
  }, [performGoogleLogin, postLoginSetup])

  const continueAsGuest = useCallback(async () => {
    const guest = setGuestAuth()
    await postLoginSetup(guest.tier)
  }, [postLoginSetup, setGuestAuth])

  const leaveGuest = useCallback(async () => {
    if (user?.tier !== 'guest') return
    try {
      await flushProjectSave()
      await useReportStore.getState().flushSaves()
      await resetWorkspace()
      clearGuestAuth()
    } catch (error) {
      setState(previous => ({
        ...previous,
        syncError: error instanceof Error
          ? `Could not safely close the guest workspace: ${error.message}`
          : 'Could not safely close the guest workspace.',
      }))
      throw error
    }
  }, [clearGuestAuth, flushProjectSave, resetWorkspace, user?.tier])

  const logout = useCallback(async () => {
    try {
      await flushProjectSave()
      await useReportStore.getState().flushSaves()
      await performLogout()
      await resetWorkspace()
    } catch (error) {
      setState(previous => ({
        ...previous,
        syncError: error instanceof Error
          ? `Sign out failed: ${error.message}`
          : 'Sign out failed. Try again while connected.',
      }))
    }
  }, [flushProjectSave, performLogout, resetWorkspace])

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
  }, [state.projectId])

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
    projectLimitViolation,
    setProjectLimitViolation,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
