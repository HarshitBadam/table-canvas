import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatApiErrorMessage } from '@/api/client'
import {
  fetchProjects,
  flushAllProjectSavesWithSync,
  setProjectSyncErrorHandler,
  syncOfflineAccountProjects,
} from '@/persistence/sync/session/syncService'
import { getDependentNodeIds } from '@/engine/graph/workflowGraph'
import { dropEngineTables } from '@/engine/materialization/engineTableCleanup'
import { useReportStore } from '@/report/reportStore'
import type { LimitExceeded } from '@/shared/enforce'
import { useProjectStore } from '../projectStore'
import { useDataStore } from '../dataStore'
import { useAuthState } from './useAuthState'
import {
  clearProjectRuntime,
  initializeEngine,
  loadOrCreateProject,
} from '../project/projectLifecycle'
import {
  AppContext, type AppContextValue, type AppProviderState, type AppPhase,
} from './appContextValue'
import { useProjectActions } from './persistence/useProjectActions'
import { prepareProjectState } from '../project/projectPreparation'
import { usePersistenceLifecycle } from './persistence/usePersistenceLifecycle'
import { requestedDocumentProjectId, useDocumentSession } from './useDocumentSession'
import { useDocumentCoordination } from '../document/useDocumentCoordination'
import { useProjectAutosave } from './persistence/useProjectAutosave'
import { useBackgroundTableRefresh } from '../runtime/useBackgroundTableRefresh'
import { useProjectActivityTracking } from './persistence/useProjectActivityTracking'
import { useProjectCatalogReconcile } from './persistence/useProjectCatalogReconcile'
import { useAppSessionActions } from './useAppSessionActions'
import { publishCatalogChanged } from '@/persistence/sync/project/projectCatalog'

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

  useProjectCatalogReconcile({
    isAuthenticated: state.isAuthenticated,
    phase: state.phase,
    engineReady: state.engineReady,
    initialized,
    clearActiveWorkspace,
    setState,
    userId: user?.id,
  })

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

  const {
    login,
    googleLogin,
    continueAsGuest,
    leaveGuest,
    logout,
  } = useAppSessionActions({
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
  })

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
