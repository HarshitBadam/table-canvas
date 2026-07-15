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
  flushProjectSaveWithSync,
  loadProjectWithSync,
  saveProjectWithSync,
  syncLocalProjectsToBackend,
} from '@/persistence/syncService'
import type { ProjectWithSync } from '@/persistence/projectSync'
import { getDependentNodeIds } from '@/engine/workflowGraph'
import { useReportStore } from '@/report/reportStore'
import { checkProjectCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { useProjectStore } from './projectStore'
import { useDataStore } from './dataStore'
import { useAuthState } from './useAuthState'
import {
  clearProjectRuntime,
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
      } catch (error) {
        console.error('[AppContext] Auto-save failed:', error)
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
    if (projectId) await flushProjectSaveWithSync(projectId)
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
    await clearProjectRuntime(useProjectStore.getState().nodes)
    useProjectStore.setState({
      projectId: project.id,
      projectName: project.name,
      nodes: project.nodes,
      edges: project.edges,
      patches: project.patches,
    })
    await useReportStore.getState().initializeProject(project.id)
    if (hasTables(project.nodes)) {
      setPhase('materializing')
      await materializeProjectTables(project.nodes)
    }
  }, [setPhase])

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
    void saveLatestProject()
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

  const logout = useCallback(async () => {
    try {
      await flushProjectSave()
      await useReportStore.getState().flushSaves()
    } catch (error) {
      console.error('[AppContext] Failed to flush saves before logout:', error)
    }
    await clearProjectRuntime(useProjectStore.getState().nodes)
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
  }, [flushProjectSave, performLogout])

  const createNewProject = useCallback(async (name?: string) => {
    const tier: Tier = user?.tier ?? 'guest'
    const projectCheck = checkProjectCount(state.projects.length, tier)
    if (!projectCheck.ok) {
      setProjectLimitViolation(projectCheck)
      return
    }
    await flushProjectSave()
    await useReportStore.getState().flushSaves()
    setPhase('loading_project')
    const project = await createProjectWithSync(name || 'Untitled Project')
    await prepareProject(project)
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
    setPhase('ready')
  }, [flushProjectSave, prepareProject, setPhase, state.projects.length, user?.tier])

  const loadProject = useCallback(async (projectId: string) => {
    try {
      await flushProjectSave()
      await useReportStore.getState().flushSaves()
      setPhase('loading_project')
      const project = await loadProjectWithSync(projectId)
      if (!project) throw new Error('Project not found')
      await prepareProject(project)
      setState(previous => ({
        ...previous,
        projectId: project.id,
        projectName: project.name,
      }))
      setPhase('ready')
    } catch (error) {
      setPhase('error', error instanceof Error ? error.message : 'Failed to load project')
    }
  }, [flushProjectSave, prepareProject, setPhase])

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
      try {
        await getEngine().dropTable(id)
      } catch (error) {
        console.error('[AppContext] Failed to drop table from engine:', error)
      }
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
    renameProject,
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
