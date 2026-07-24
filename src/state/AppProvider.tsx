import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LoginCredentials } from '@/api/auth.api'
import {
  fetchProjects,
  flushProjectSaveWithSync,
  saveProjectWithSync,
  setProjectSyncErrorHandler,
  syncLocalProjectsToBackend,
} from '@/persistence/syncService'
import {
  isRetryableRemoteDeferral,
  type ProjectWithSync,
} from '@/persistence/projectSync'
import { getDependentNodeIds } from '@/engine/workflowGraph'
import { dropEngineTables } from '@/engine/engineTableCleanup'
import { useReportStore } from '@/report/reportStore'
import { loadReportsForProject } from '@/persistence/reportStorage'
import type { LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { useProjectStore } from './projectStore'
import { useDataStore } from './dataStore'
import { useAuthState } from './useAuthState'
import { withoutTransientComputeState } from './transientProjectState'
import {
  clearProjectRuntime,
  hasProjectTables,
  initializeEngine,
  loadOrCreateProject,
  materializeProjectTables,
} from './projectLifecycle'
import {
  AppContext, type AppContextValue, type AppProviderState, type AppPhase,
} from './appContextValue'
import { useProjectActions } from './useProjectActions'
import { ProjectActionError } from './projectOperations'
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

  const prepareProject = useCallback(async (project: ProjectWithSync) => {
    const nodes = withoutTransientComputeState(project.nodes)
    const reports = await loadReportsForProject(project.id)
    const previousProject = useProjectStore.getState()
    const previousReports = useReportStore.getState()
    const previousData = useDataStore.getState().tableData
    const projectSnapshot = {
      projectId: previousProject.projectId,
      projectName: previousProject.projectName,
      nodes: structuredClone(previousProject.nodes),
      edges: structuredClone(previousProject.edges),
      patches: structuredClone(previousProject.patches),
      selectedNodeId: previousProject.selectedNodeId,
      history: structuredClone(previousProject.history),
    }
    const reportSnapshot = {
      reports: structuredClone(previousReports.reports),
      selectedReportId: previousReports.selectedReportId,
      activeProjectId: previousReports.activeProjectId,
      persistenceStatus: previousReports.persistenceStatus,
      persistenceError: previousReports.persistenceError,
    }
    try {
      await clearProjectRuntime(previousProject.nodes)
      useProjectStore.setState({
        projectId: project.id,
        projectName: project.name,
        nodes,
        edges: project.edges,
        patches: project.patches,
        selectedNodeId: null,
        history: { past: [], future: [] },
      })
      const selectedReportId = Object.values(reports)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null
      useReportStore.setState({
        reports,
        selectedReportId,
        activeProjectId: project.id,
        persistenceStatus: 'idle',
        persistenceError: null,
      })
      if (hasProjectTables(nodes)) {
        const result = await materializeProjectTables(nodes)
        if (result.failures.length > 0) {
          throw new Error(
            `Could not prepare ${result.failures.length} project table${
              result.failures.length === 1 ? '' : 's'
            }: ${result.failures[0].error}`,
          )
        }
      }
    } catch (error) {
      try {
        await clearProjectRuntime(nodes)
        useProjectStore.setState(projectSnapshot)
        useReportStore.setState(reportSnapshot)
        if (hasProjectTables(projectSnapshot.nodes)) {
          await materializeProjectTables(projectSnapshot.nodes)
        }
        useDataStore.setState({ tableData: previousData })
      } catch (restoreError) {
        throw new ProjectActionError(
          'persistence',
          'Project preparation failed and the previous project could not be fully restored.',
          { failure: error, restorationFailure: restoreError },
        )
      }
      throw error
    }
  }, [])

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

  useEffect(() => {
    setState(previous => ({ ...previous, user, isAuthenticated }))
    if (!isAuthenticated && useProjectStore.getState().projectId) {
      void resetWorkspace()
    }
  }, [user, isAuthenticated, resetWorkspace])

  useEffect(() => {
    setProjectSyncErrorHandler(message => {
      setState(previous => ({ ...previous, syncError: message }))
    })
    return () => setProjectSyncErrorHandler(null)
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
    if (!user || user.tier === 'guest') return
    const handleOnline = () => {
      void syncLocalProjectsToBackend()
      const projectId = useProjectStore.getState().projectId
      if (projectId) {
        void flushProjectSaveWithSync(projectId).catch(error => {
          console.error('[AppContext] Reconnect sync failed:', error)
        })
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [user])

  const postLoginSetup = useCallback(async (tier: Tier) => {
    setPhase('loading_project')
    if (tier !== 'guest') {
      await syncLocalProjectsToBackend()
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
    await flushProjectSave()
    await useReportStore.getState().flushSaves()
    await resetWorkspace()
    clearGuestAuth()
  }, [clearGuestAuth, flushProjectSave, resetWorkspace, user?.tier])

  const logout = useCallback(async () => {
    await flushProjectSave()
    await useReportStore.getState().flushSaves()
    await performLogout()
    await resetWorkspace()
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
