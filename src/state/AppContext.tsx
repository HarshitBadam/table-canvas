import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useProjectStore } from './projectStore';
import { useDataStore } from './dataStore';
import { getEngine } from '@/engine';
import { ensureTableMaterialized } from '@/engine/materializationService';
import type { LoginCredentials, User } from '@/api/auth.api';
import {
  fetchProjects,
  createProjectWithSync,
  loadProjectWithSync,
  saveProjectWithSync,
} from '@/persistence/syncService';
import { deleteFile } from '@/persistence/db';
import { ProjectSummary } from '@/api/projects.api';
import type { SourceTableNode, ProjectNode } from '@/types';
import { initializeReportStore } from '@/report/reportStore';
import { useAuthState } from './useAuthState';
import { checkProjectCount, type LimitExceeded } from '@/shared/enforce';
import type { Tier } from '@/shared/limits';

export type AppPhase =
  | 'idle'
  | 'initializing_engine'
  | 'checking_auth'
  | 'loading_project'
  | 'materializing'
  | 'ready'
  | 'error';

interface AppState {
  phase: AppPhase;
  phaseMessage: string;
  engineReady: boolean;
  user: User | null;
  isAuthenticated: boolean;
  projectId: string | null;
  projectName: string;
  projects: ProjectSummary[];
  isSaving: boolean;
  error: string | null;
}

interface AppContextValue extends AppState {
  login: (credentials: LoginCredentials) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  createNewProject: (name?: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  deleteNodeWithSync: (nodeId: string) => Promise<void>;
  projectLimitViolation: LimitExceeded | null;
  setProjectLimitViolation: (v: LimitExceeded | null) => void;
  isReady: boolean;
  isLoading: boolean;
}

const PHASE_MESSAGES: Record<AppPhase, string> = {
  idle: 'Starting...',
  initializing_engine: 'Starting data engine...',
  checking_auth: 'Checking authentication...',
  loading_project: 'Loading your project...',
  materializing: 'Preparing tables...',
  ready: 'Ready',
  error: 'Something went wrong',
};

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

/** Materializes source tables first, then derived. Per-table failures are swallowed. */
async function materializeProjectTables(nodes: Record<string, ProjectNode>) {
  const byKind = (kind: string) => Object.entries(nodes).filter(([, n]) => n.kind === kind).map(([id]) => id);
  for (const tableId of [...byKind('source_table'), ...byKind('derived_table')]) {
    try { await ensureTableMaterialized(tableId); } catch (error) { console.error('[AppContext] Failed to materialize table:', error); }
  }
}

async function loadOrCreateProject() {
  const projectList = await fetchProjects();

  let project;
  if (projectList.length > 0) {
    project = await loadProjectWithSync(projectList[0].id);
  }
  if (!project) {
    project = await createProjectWithSync('Untitled Project');
  }

  useProjectStore.setState({
    projectId: project.id,
    projectName: project.name,
    nodes: project.nodes,
    edges: project.edges,
    patches: project.patches,
  });

  return { project, projectList };
}

export function AppProvider({ children }: AppProviderProps) {
  const auth = useAuthState();
  const [projectLimitViolation, setProjectLimitViolation] = useState<LimitExceeded | null>(null);

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
  });

  const initRef = useRef(false);
  const isSavingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const patches = useProjectStore((s) => s.patches);
  const projectName = useProjectStore((s) => s.projectName);

  const setPhase = useCallback((phase: AppPhase, error?: string) => {
    setState((prev) => ({
      ...prev,
      phase,
      phaseMessage: error || PHASE_MESSAGES[phase],
      error: phase === 'error' ? (error || 'Unknown error') : null,
    }));
  }, []);

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      user: auth.user,
      isAuthenticated: auth.isAuthenticated,
    }));
  }, [auth.user, auth.isAuthenticated]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initialize = async () => {
      try {
        setPhase('initializing_engine');
        const engine = getEngine();
        await engine.init();
        setState((prev) => ({ ...prev, engineReady: true }));

        setPhase('checking_auth');
        const { user, shouldContinue } = await auth.performCheckAuth();

        if (!shouldContinue || !user) {
          setPhase('ready');
          return;
        }

        setPhase('loading_project');
        const { project, projectList } = await loadOrCreateProject();

        setState((prev) => ({
          ...prev,
          projectId: project.id,
          projectName: project.name,
          projects: projectList.length > 0 ? projectList : [
            { id: project.id, name: project.name, updatedAt: new Date(), createdAt: new Date() },
          ],
        }));

        try {
          await initializeReportStore();
        } catch (err) {
          console.error('[AppContext] Failed to initialize reports:', err);
        }

        const hasTables = Object.values(project.nodes).some(
          (n) => n.kind === 'source_table' || n.kind === 'derived_table'
        );
        if (hasTables) {
          setPhase('materializing');
          await materializeProjectTables(project.nodes);
        }

        setPhase('ready');
      } catch (error) {
        setPhase('error', error instanceof Error ? error.message : 'Initialization failed');
      }
    };

    initialize();
  }, [setPhase, auth.performCheckAuth]);

  useEffect(() => {
    if (state.phase !== 'ready' || !state.isAuthenticated || !state.projectId) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setState((prev) => ({ ...prev, isSaving: true }));

      try {
        await saveProjectWithSync(state.projectId!, projectName, nodes, edges, patches);
      } catch (error) { console.error('[AppContext] Auto-save failed:', error); } finally {
        isSavingRef.current = false;
        setState((prev) => ({ ...prev, isSaving: false }));
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, patches, projectName, state.phase, state.isAuthenticated, state.projectId]);

  const postLoginSetup = useCallback(async () => {
    setPhase('loading_project');
    const { project, projectList } = await loadOrCreateProject();

    setState((prev) => ({
      ...prev,
      projectId: project.id,
      projectName: project.name,
      projects: projectList.length > 0 ? projectList : [
        { id: project.id, name: project.name, updatedAt: new Date(), createdAt: new Date() },
      ],
    }));

    const hasTables = Object.values(project.nodes).some(
      (n) => n.kind === 'source_table' || n.kind === 'derived_table'
    );
    if (hasTables) {
      setPhase('materializing');
      await materializeProjectTables(project.nodes);
    }

    setPhase('ready');
  }, [setPhase]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    await auth.performLogin(credentials);
    await postLoginSetup();
  }, [auth.performLogin, postLoginSetup]);

  const googleLogin = useCallback(async (credential: string) => {
    await auth.performGoogleLogin(credential);
    await postLoginSetup();
  }, [auth.performGoogleLogin, postLoginSetup]);

  const logout = useCallback(async () => {
    await auth.performLogout();
    setState((prev) => ({
      ...prev,
      projectId: null,
      projectName: 'Untitled Project',
      projects: [],
    }));
    useProjectStore.setState({
      projectId: '',
      projectName: 'Untitled Project',
      nodes: {},
      edges: {},
      patches: {},
      selectedNodeId: null,
    });
    useDataStore.setState({ tableData: {} });
  }, [auth.performLogout]);

  const createNewProject = useCallback(async (name?: string) => {
    const tier: Tier = auth.user?.tier ?? 'guest';
    const projCheck = checkProjectCount(state.projects.length, tier);
    if (!projCheck.ok) {
      setProjectLimitViolation(projCheck);
      return;
    }

    const project = await createProjectWithSync(name || 'Untitled Project');

    useProjectStore.setState({
      projectId: project.id,
      projectName: project.name,
      nodes: project.nodes,
      edges: project.edges,
      patches: project.patches,
    });

    setState((prev) => ({
      ...prev,
      projectId: project.id,
      projectName: project.name,
      projects: [
        { id: project.id, name: project.name, updatedAt: new Date(), createdAt: new Date() },
        ...prev.projects,
      ],
    }));
  }, [auth.user?.tier, state.projects.length]);

  const loadProject = useCallback(async (projectId: string) => {
    try {
      setPhase('loading_project');

      const project = await loadProjectWithSync(projectId);
      if (!project) throw new Error('Project not found');

      useProjectStore.setState({
        projectId: project.id,
        projectName: project.name,
        nodes: project.nodes,
        edges: project.edges,
        patches: project.patches,
      });

      setState((prev) => ({
        ...prev,
        projectId: project.id,
        projectName: project.name,
      }));

      const hasTables = Object.values(project.nodes).some(
        (n) => n.kind === 'source_table' || n.kind === 'derived_table'
      );
      if (hasTables) {
        setPhase('materializing');
        await materializeProjectTables(project.nodes);
      }

      setPhase('ready');
    } catch (error) {
      setPhase('error', error instanceof Error ? error.message : 'Failed to load project');
    }
  }, [setPhase]);

  const refreshProjects = useCallback(async () => {
    try {
      const projectList = await fetchProjects();
      setState((prev) => ({ ...prev, projects: projectList }));
    } catch (error) { console.error('[AppContext] Failed to refresh project list:', error); }
  }, []);

  const deleteNodeWithSync = useCallback(async (nodeId: string) => {
    const currentNodes = useProjectStore.getState().nodes;
    const node = currentNodes[nodeId];
    if (!node) return;

    let fileRef: string | null = null;
    if (node.kind === 'source_table') {
      fileRef = (node as SourceTableNode).plan.fileRef;
    }

    useProjectStore.getState().deleteNode(nodeId);
    useDataStore.getState().clearTableData(nodeId);

    if (fileRef) {
      try { await deleteFile(fileRef); } catch (error) { console.error('[AppContext] Failed to delete file from storage:', error); }
    }

    try {
      const engine = getEngine();
      await engine.dropTable(nodeId);
    } catch (error) { console.error('[AppContext] Failed to drop table from engine:', error); }
  }, []);

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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export function useAppAuth() {
  const { user, isAuthenticated, login, googleLogin, logout } = useApp();
  return { user, isAuthenticated, login, googleLogin, logout };
}
