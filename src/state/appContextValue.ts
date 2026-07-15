import { createContext, useContext } from 'react'
import type { LoginCredentials, User } from '@/api/auth.api'
import type { ProjectSummary } from '@/api/projects.api'
import type { LimitExceeded } from '@/shared/enforce'

export type AppPhase =
  | 'idle'
  | 'initializing_engine'
  | 'checking_auth'
  | 'loading_project'
  | 'materializing'
  | 'ready'
  | 'error'

export interface AppContextValue {
  phase: AppPhase
  phaseMessage: string
  engineReady: boolean
  user: User | null
  isAuthenticated: boolean
  projectId: string | null
  projectName: string
  projects: ProjectSummary[]
  isSaving: boolean
  error: string | null
  login: (credentials: LoginCredentials) => Promise<void>
  googleLogin: (credential: string) => Promise<void>
  logout: () => Promise<void>
  createNewProject: (name?: string) => Promise<void>
  loadProject: (projectId: string) => Promise<void>
  renameProject: (name: string) => void
  refreshProjects: () => Promise<void>
  deleteNodeWithSync: (nodeId: string) => Promise<void>
  projectLimitViolation: LimitExceeded | null
  setProjectLimitViolation: (violation: LimitExceeded | null) => void
  isReady: boolean
  isLoading: boolean
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within an AppProvider')
  return context
}

export function useAppAuth() {
  const { user, isAuthenticated, login, googleLogin, logout } = useApp()
  return { user, isAuthenticated, login, googleLogin, logout }
}
