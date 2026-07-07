/**
 * AppContext - Centralized application state machine
 * 
 * Orchestrates initialization in sequence:
 * 1. Initialize DuckDB engine
 * 2. Check authentication
 * 3. Load project from backend
 * 4. Materialize all tables
 * 
 * Also provides centralized delete functionality with backend sync.
 */

import {
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
} from '@/api/auth.api';
import { setAuthErrorHandler } from '@/api/client';
import {
  fetchProjects,
  createProjectWithSync,
  loadProjectWithSync,
  saveProjectWithSync,
} from '@/persistence/syncService';
import { deleteFile } from '@/persistence/db';
import type { SourceTableNode } from '@/lib/types';
import { initializeReportStore } from '@/report/reportStore';
import {
  AppContext,
  type AppPhase,
  type AppState,
  type AppContextValue,
} from './appContext';

// ============================================================================
// Phase Messages
// ============================================================================

const PHASE_MESSAGES: Record<AppPhase, string> = {
  idle: 'Starting...',
  initializing_engine: 'Starting data engine...',
  checking_auth: 'Checking authentication...',
  loading_project: 'Loading your project...',
  materializing: 'Preparing tables...',
  ready: 'Ready',
  error: 'Something went wrong',
};

// ============================================================================
// Provider
// ============================================================================

interface AppProviderProps {
  children: ReactNode;
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

  // Refs
  const initRef = useRef(false);
  const isSavingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get store state for auto-save
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const patches = useProjectStore((s) => s.patches);
  const projectName = useProjectStore((s) => s.projectName);

  // Helper to update phase
  const setPhase = useCallback((phase: AppPhase, error?: string) => {
    setState((prev) => ({
      ...prev,
      phase,
      phaseMessage: error || PHASE_MESSAGES[phase],
      error: phase === 'error' ? (error || 'Unknown error') : null,
    }));
  }, []);

  // Handle auth errors from API client (e.g., session expired)
  const handleAuthError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      user: null,
      isAuthenticated: false,
    }));
  }, []);

  // Set up auth error handler
  useEffect(() => {
    setAuthErrorHandler(handleAuthError);
  }, [handleAuthError]);

  // ========================================================================
  // Initialization Sequence
  // ========================================================================

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initialize = async () => {
      try {
        // Phase 1: Initialize Engine
        setPhase('initializing_engine');
        const engine = getEngine();
        await engine.init();
        setState((prev) => ({ ...prev, engineReady: true }));

        // Phase 2: Check Authentication
        setPhase('checking_auth');
        let user = await checkAuth();
        
        if (!user) {
          // Check if backend is reachable with a short timeout
          // This prevents long waits in environments without a backend (e.g., local-only mode, CI)
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
          let backendReachable = false;
          
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
            
            const response = await fetch(`${API_BASE_URL}/auth/me`, {
              method: 'GET',
              credentials: 'include',
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            // If we get any response (even 401), backend is reachable
            backendReachable = true;
            // If 401, user just needs to login
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
            // Network error or timeout - backend is not reachable
            backendReachable = false;
          }
          
          if (!backendReachable) {
            // Local mode - no backend available, proceed with mock user
            console.log('[AppContext] Backend not reachable, enabling local mode');
            user = {
              id: 'local-user',
              email: 'local@tablecanvas.app',
              name: 'Local User',
              createdAt: new Date(),
            };
          } else {
            // Backend is reachable but user not authenticated - show login
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

        setState((prev) => ({
          ...prev,
          user,
          isAuthenticated: true,
        }));

        // Phase 3: Load Project
        setPhase('loading_project');
        const projectList = await fetchProjects();
        
        let project;
        if (projectList.length > 0) {
          project = await loadProjectWithSync(projectList[0].id);
        }
        
        if (!project) {
          // No projects or failed to load - create new
          project = await createProjectWithSync('Untitled Project');
        }

        // Update Zustand store
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
          projects: projectList.length > 0 ? projectList : [
            { id: project.id, name: project.name, updatedAt: new Date(), createdAt: new Date() },
          ],
        }));

        // Initialize reports from IndexedDB
        try {
          await initializeReportStore();
        } catch (err) {
          console.error('[AppContext] Failed to initialize reports:', err);
        }

        // Phase 4: Materialize Tables (source tables first, then derived)
        const sourceTableIds = Object.entries(project.nodes)
          .filter(([, node]) => node.kind === 'source_table')
          .map(([id]) => id);

        const derivedTableIds = Object.entries(project.nodes)
          .filter(([, node]) => node.kind === 'derived_table')
          .map(([id]) => id);

        const totalTables = sourceTableIds.length + derivedTableIds.length;

        if (totalTables > 0) {
          setPhase('materializing');
          
          // First materialize source tables
          for (const tableId of sourceTableIds) {
            try {
              await ensureTableMaterialized(tableId);
            } catch {
              // Table materialization failed, will show error state
            }
          }
          
          // Then materialize derived tables (ensureTableMaterialized handles dependency ordering)
          for (const tableId of derivedTableIds) {
            try {
              await ensureTableMaterialized(tableId);
            } catch {
              // Table materialization failed, will show error state
            }
          }
        }

        setPhase('ready');

      } catch (error) {
        setPhase('error', error instanceof Error ? error.message : 'Initialization failed');
      }
    };

    initialize();
  }, [setPhase]);

  // ========================================================================
  // Auto-save Effect
  // ========================================================================

  useEffect(() => {
    // Don't save if not ready or not authenticated
    if (state.phase !== 'ready' || !state.isAuthenticated || !state.projectId) {
      return;
    }

    // Debounce saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;

      isSavingRef.current = true;
      setState((prev) => ({ ...prev, isSaving: true }));

      try {
        await saveProjectWithSync(
          state.projectId!,
          projectName,
          nodes,
          edges,
          patches
        );
      } catch {
        // Auto-save failed, will retry on next change
      } finally {
        isSavingRef.current = false;
        setState((prev) => ({ ...prev, isSaving: false }));
      }
    }, 1500); // 1.5 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, patches, projectName, state.phase, state.isAuthenticated, state.projectId]);

  // ========================================================================
  // Auth Actions
  // ========================================================================

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { user } = await apiLogin(credentials);
    
    setState((prev) => ({
      ...prev,
      user,
      isAuthenticated: true,
    }));

    // Load project after login
    setPhase('loading_project');
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

    setState((prev) => ({
      ...prev,
      projectId: project.id,
      projectName: project.name,
      projects: projectList.length > 0 ? projectList : [
        { id: project.id, name: project.name, updatedAt: new Date(), createdAt: new Date() },
      ],
    }));

    // Materialize tables (source first, then derived)
    const sourceTableIds = Object.entries(project.nodes)
      .filter(([, node]) => node.kind === 'source_table')
      .map(([id]) => id);

    const derivedTableIds = Object.entries(project.nodes)
      .filter(([, node]) => node.kind === 'derived_table')
      .map(([id]) => id);

    if (sourceTableIds.length > 0 || derivedTableIds.length > 0) {
      setPhase('materializing');
      for (const tableId of sourceTableIds) {
        try {
          await ensureTableMaterialized(tableId);
        } catch {
          // Materialization failed
        }
      }
      for (const tableId of derivedTableIds) {
        try {
          await ensureTableMaterialized(tableId);
        } catch {
          // Materialization failed
        }
      }
    }

    setPhase('ready');
  }, [setPhase]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore logout errors
    } finally {
      // Clear state
      setState((prev) => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        projectId: null,
        projectName: 'Untitled Project',
        projects: [],
      }));

      // Clear stores
      useProjectStore.setState({
        projectId: '',
        projectName: 'Untitled Project',
        nodes: {},
        edges: {},
        patches: {},
        selectedNodeId: null,
      });

      useDataStore.setState({
        tableData: {},
      });
    }
  }, []);

  // ========================================================================
  // Project Actions
  // ========================================================================

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
      if (!project) {
        throw new Error('Project not found');
      }

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

      // Materialize tables (source first, then derived)
      const sourceTableIds = Object.entries(project.nodes)
        .filter(([, node]) => node.kind === 'source_table')
        .map(([id]) => id);

      const derivedTableIds = Object.entries(project.nodes)
        .filter(([, node]) => node.kind === 'derived_table')
        .map(([id]) => id);

      if (sourceTableIds.length > 0 || derivedTableIds.length > 0) {
        setPhase('materializing');
        for (const tableId of sourceTableIds) {
          try {
            await ensureTableMaterialized(tableId);
          } catch {
            // Materialization failed
          }
        }
        for (const tableId of derivedTableIds) {
          try {
            await ensureTableMaterialized(tableId);
          } catch {
            // Materialization failed
          }
        }
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
    } catch {
      // Refresh failed
    }
  }, []);

  // ========================================================================
  // Delete Node with Sync
  // ========================================================================

  const deleteNodeWithSync = useCallback(async (nodeId: string) => {
    const currentNodes = useProjectStore.getState().nodes;
    const node = currentNodes[nodeId];
    
    if (!node) {
      return;
    }

    // Get file reference before deleting (for source tables)
    let fileRef: string | null = null;
    if (node.kind === 'source_table') {
      fileRef = (node as SourceTableNode).plan.fileRef;
    }

    // 1. Delete from Zustand store (this handles edges too)
    useProjectStore.getState().deleteNode(nodeId);

    // 2. Clear from data store (in-memory)
    useDataStore.getState().clearTableData(nodeId);

    // 3. Delete file from IndexedDB if exists
    if (fileRef) {
      try {
        await deleteFile(fileRef);
      } catch {
        // File deletion failed
      }
    }

    // 4. Drop from DuckDB engine
    try {
      const engine = getEngine();
      await engine.dropTable(nodeId);
    } catch {
      // Engine cleanup failed
    }
  }, []);

  // ========================================================================
  // Context Value
  // ========================================================================

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
