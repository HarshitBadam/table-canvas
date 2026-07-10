import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getEngine } from '@/engine'
import type { LoginCredentials } from '@/api/auth.api'
import {
  createProjectWithSync,
  fetchProjects,
  loadProjectWithSync,
  saveProjectWithSync,
} from '@/persistence/syncService'
import { deleteFile } from '@/persistence/db'
import type { SourceTableNode } from '@/types'
import { useReportStore } from '@/report/reportStore'
import { checkProjectCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { useProjectStore } from './projectStore'
import { useDataStore } from './dataStore'
import { useAuthState } from './useAuthState'
import {
  initializeEngine,
  loadOrCreateProject,
  materializeProjectTables,
} from './projectLifecycle'
import {
  AppContext,
  type AppContextValue,
  type AppPhase,
} from './appContextValue'

const PHASE_MESSAGES: Record<AppPhase, string> = {
  idle: 'Starting...',
  initializing_engine: 'Starting data engine...',
  checking_auth: 'Checking authentication...',
  loading_project: 'Loading your project...',
  materializing: 'Preparing tables...',
  ready: 'Ready',
  error: 'Something went wrong',
}

type AppState = Pick<
  AppContextValue,
  | 'phase'
  | 'phaseMessage'
  | 'engineReady'
  | 'user'
  | 'isAuthenticated'
  | 'projectId'
  | 'projectName'
  | 'projects'
  | 'isSaving'
  | 'error'
>

export function AppProvider({ children }: { children: ReactNode }) {
  const {
    user,
    isAuthenticated,
    performCheckAuth,
    performLogin,
    performGoogleLogin,
    performLogout,
  } = useAuthState()
  const [projectLimitViolation, setProjectLimitViolation] =
    useState<LimitExceeded | null>(null)
  const [state, setState] = useState<AppState>({
    phase: 'idle',
    phaseMessage: PHASE_MESSAGES.idle,
    engineReady: false,
    user: null,
    isAuthenticated: false,
    projectId: null,
    projectName: 'Untitled Project',
    projects: [],
    isSaving: false,
    error: null,
  })
  const initialized = useRef(false)
  const saving = useRef(false)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodes = useProjectStore(store => store.nodes)
  const edges = useProjectStore(store => store.edges)
  const patches = useProjectStore(store => store.patches)
  const projectName = useProjectStore(store => store.projectName)

  const setPhase = useCallback((phase: AppPhase, error?: string) => {
    setState(previous => ({
      ...previous,
      phase,
      phaseMessage: error || PHASE_MESSAGES[phase],
      error: phase === 'error' ? error || 'Unknown error' : null,
    }))
  }, [])

  useEffect(() => {
    setState(previous => ({ ...previous, user, isAuthenticated }))
  }, [user, isAuthenticated])

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

        setPhase('loading_project')
        const { project, projectList } = await loadOrCreateProject()
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
        await useReportStore.getState().initializeProject(project.id)
        if (hasTables(project.nodes)) {
          setPhase('materializing')
          await materializeProjectTables(project.nodes)
        }
        setPhase('ready')
      } catch (error) {
        setPhase('error', error instanceof Error ? error.message : 'Initialization failed')
      }
    }

    void initialize()
  }, [performCheckAuth, setPhase])

  useEffect(() => {
    if (state.phase !== 'ready' || !state.isAuthenticated || !state.projectId) return
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      if (saving.current) return
      saving.current = true
      setState(previous => ({ ...previous, isSaving: true }))
      try {
        await saveProjectWithSync(state.projectId!, projectName, nodes, edges, patches)
      } catch (error) {
        console.error('[AppContext] Auto-save failed:', error)
      } finally {
        saving.current = false
        setState(previous => ({ ...previous, isSaving: false }))
      }
    }, 1500)
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
    }
  }, [
    edges,
    nodes,
    patches,
    projectName,
    state.isAuthenticated,
    state.phase,
    state.projectId,
  ])

  const postLoginSetup = useCallback(async () => {
    setPhase('loading_project')
    const { project, projectList } = await loadOrCreateProject()
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
    await useReportStore.getState().initializeProject(project.id)
    if (hasTables(project.nodes)) {
      setPhase('materializing')
      await materializeProjectTables(project.nodes)
    }
    setPhase('ready')
  }, [setPhase])

  const login = useCallback(async (credentials: LoginCredentials) => {
    await performLogin(credentials)
    await postLoginSetup()
  }, [performLogin, postLoginSetup])

  const googleLogin = useCallback(async (credential: string) => {
    await performGoogleLogin(credential)
    await postLoginSetup()
  }, [performGoogleLogin, postLoginSetup])

  const logout = useCallback(async () => {
    try {
      await useReportStore.getState().flushSaves()
    } catch (error) {
      console.error('[AppContext] Failed to flush reports before logout:', error)
    }
    await performLogout()
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
  }, [performLogout])

  const createNewProject = useCallback(async (name?: string) => {
    const tier: Tier = user?.tier ?? 'guest'
    const projectCheck = checkProjectCount(state.projects.length, tier)
    if (!projectCheck.ok) {
      setProjectLimitViolation(projectCheck)
      return
    }
    const project = await createProjectWithSync(name || 'Untitled Project')
    useProjectStore.setState({
      projectId: project.id,
      projectName: project.name,
      nodes: project.nodes,
      edges: project.edges,
      patches: project.patches,
    })
    await useReportStore.getState().initializeProject(project.id)
    setState(previous => ({
      ...previous,
      projectId: project.id,
      projectName: project.name,
      projects: [{
        id: project.id,
        name: project.name,
        updatedAt: new Date(),
        createdAt: new Date(),
      }, ...previous.projects],
    }))
  }, [state.projects.length, user?.tier])

  const loadProject = useCallback(async (projectId: string) => {
    try {
      setPhase('loading_project')
      const project = await loadProjectWithSync(projectId)
      if (!project) throw new Error('Project not found')
      useProjectStore.setState({
        projectId: project.id,
        projectName: project.name,
        nodes: project.nodes,
        edges: project.edges,
        patches: project.patches,
      })
      setState(previous => ({
        ...previous,
        projectId: project.id,
        projectName: project.name,
      }))
      await useReportStore.getState().initializeProject(project.id)
      if (hasTables(project.nodes)) {
        setPhase('materializing')
        await materializeProjectTables(project.nodes)
      }
      setPhase('ready')
    } catch (error) {
      setPhase('error', error instanceof Error ? error.message : 'Failed to load project')
    }
  }, [setPhase])

  const refreshProjects = useCallback(async () => {
    try {
      const projects = await fetchProjects()
      setState(previous => ({ ...previous, projects }))
    } catch (error) {
      console.error('[AppContext] Failed to refresh project list:', error)
    }
  }, [])

  const deleteNodeWithSync = useCallback(async (nodeId: string) => {
    const node = useProjectStore.getState().nodes[nodeId]
    if (!node) return
    const fileRef = node.kind === 'source_table'
      ? (node as SourceTableNode).plan.fileRef
      : null
    useProjectStore.getState().deleteNode(nodeId)
    useDataStore.getState().clearTableData(nodeId)
    if (fileRef) {
      try {
        await deleteFile(fileRef)
      } catch (error) {
        console.error('[AppContext] Failed to delete file from storage:', error)
      }
    }
    try {
      await getEngine().dropTable(nodeId)
    } catch (error) {
      console.error('[AppContext] Failed to drop table from engine:', error)
    }
  }, [])

  const value: AppContextValue = {
    ...state,
    isReady: state.phase === 'ready',
    isLoading: state.phase !== 'ready' && state.phase !== 'error',
    login,
    googleLogin,
    logout,
    createNewProject,
    loadProject,
    refreshProjects,
    deleteNodeWithSync,
    projectLimitViolation,
    setProjectLimitViolation,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function hasTables(nodes: Record<string, { kind: string }>): boolean {
  return Object.values(nodes).some(
    node => node.kind === 'source_table' || node.kind === 'derived_table',
  )
}
