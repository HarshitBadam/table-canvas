/**
 * AppContext object, value types, and hooks.
 *
 * Kept separate from AppContext.tsx (which exports the AppProvider component)
 * so that the provider file only exports components, as required for React Fast
 * Refresh to work reliably.
 */

import { createContext, useContext } from 'react';
import type { LoginCredentials, User } from '@/api/auth.api';
import type { ProjectSummary } from '@/api/projects.api';

export type AppPhase =
  | 'idle'
  | 'initializing_engine'
  | 'checking_auth'
  | 'loading_project'
  | 'materializing'
  | 'ready'
  | 'error';

export interface AppState {
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

export interface AppContextValue extends AppState {
  // Auth actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;

  // Project actions
  createNewProject: (name?: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;

  // Node actions
  deleteNodeWithSync: (nodeId: string) => Promise<void>;

  // Computed
  isReady: boolean;
  isLoading: boolean;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }

  return context;
}

// Convenience hooks
export function useAppReady(): boolean {
  return useApp().isReady;
}

export function useAppAuth() {
  const { user, isAuthenticated, login, logout } = useApp();
  return { user, isAuthenticated, login, logout };
}
