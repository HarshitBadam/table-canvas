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
import {
  checkAuth,
  logout as apiLogout,
  login as apiLogin,
  LoginCredentials,
  User,
} from '@/api/auth.api';
import { setAuthErrorHandler } from '@/api/client';
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
  logout: () => Promise<void>;
  createNewProject: (name?: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  deleteNodeWithSync: (nodeId: string) => Promise<void>;
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

/**
 * Materializes all tables in dependency order: source tables first, then derived.
 * Failures are swallowed per-table so one bad table doesn't block the rest.
 */
async function materializeProjectTables(nodes: Record<string, ProjectNode>) {
  const sourceTableIds = Object.entries(nodes)
    .filter(([, node]) => node.kind === 'source_table')
    .map(([id]) => id);

  const derivedTableIds = Object.entries(nodes)
    .filter(([, node]) => node.kind === 'derived_table')
    .map(([id]) => id);

  for (const tableId of sourceTableIds) {
    try { await ensureTableMaterialized(tableId); } catch { /* per-table failure */ }
  }
  for (const tableId of derivedTableIds) {
    try { await ensureTableMaterialized(tableId); } catch { /* per-table failure */ }
  }
}

/**
 * Loads or creates a project from the backend, hydrates Zustand, and returns metadata.
 */
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

  const handleAuthError = useCallback(() => {
    setState((prev) => ({ ...prev, user: null, isAuthenticated: false }));
  }, []);

  useEffect(() => {
    setAuthErrorHandler(handleAuthError);
  }, [handleAuthError]);

  // Initialization sequence
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
        let user = await checkAuth();

        if (!user) {
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
          let backendReachable = false;

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${API_BASE_URL}/auth/me`, {
              method: 'GET',
              credentials: 'include',
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            backendReachable = true;

            if (response.status === 401) {
              setState((prev) => ({
                ...prev,
                phase: 'ready',
                phaseMessage: PHASE_MESSAGES.ready,
                user: null,
                isAuthenticated: false,
              }));
              return;
            }
          } catch {
            backendReachable = false;
          }

          if (!backendReachable) {
            user = {
              id: 'local-user',
              email: 'local@tablecanvas.app',
              name: 'Local User',
              createdAt: new Date(),
            };
          } else {
            setState((prev) => ({
              ...prev,
              phase: 'ready',
              phaseMessage: PHASE_MESSAGES.ready,
              user: null,
              isAuthenticated: false,
            }));
            return;
          }
        }

        setState((prev) => ({ ...prev, user, isAuthenticated: true }));

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
  }, [setPhase]);

  // Auto-save
  useEffect(() => {
    if (state.phase !== 'ready' || !state.isAuthenticated || !state.projectId) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setState((prev) => ({ ...prev, isSaving: true }));

      try {
        await saveProjectWithSync(state.projectId!, projectName, nodes, edges, patches);
      } catch { /* auto-save retry on next change */ } finally {
        isSavingRef.current = false;
        setState((prev) => ({ ...prev, isSaving: false }));
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, patches, projectName, state.phase, state.isAuthenticated, state.projectId]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { user } = await apiLogin(credentials);
    setState((prev) => ({ ...prev, user, isAuthenticated: true }));

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

  const logout = useCallback(async () => {
    try { await apiLogout(); } catch { /* ignore */ } finally {
      setState((prev) => ({
        ...prev,
        user: null,
        isAuthenticated: false,
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
    }
  }, []);

  const createNewProject = useCallback(async (name?: string) => {
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
  }, []);

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
    } catch { /* refresh failed */ }
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
      try { await deleteFile(fileRef); } catch { /* file cleanup failed */ }
    }

    try {
      const engine = getEngine();
      await engine.dropTable(nodeId);
    } catch { /* engine cleanup failed */ }
  }, []);

  const value: AppContextValue = {
    ...state,
    isReady: state.phase === 'ready',
    isLoading: state.phase !== 'ready' && state.phase !== 'error',
    login,
    logout,
    createNewProject,
    loadProject,
    refreshProjects,
    deleteNodeWithSync,
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

export function useAppReady(): boolean {
  return useApp().isReady;
}

export function useAppAuth() {
  const { user, isAuthenticated, login, logout } = useApp();
  return { user, isAuthenticated, login, logout };
}
