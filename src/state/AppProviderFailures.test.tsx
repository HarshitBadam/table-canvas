import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { useApp } from './appContextValue'
import { useProjectStore } from './projectStore'

const mocks = vi.hoisted(() => ({
  saveProject: vi.fn(),
  flushProjectSave: vi.fn(),
  loadProject: vi.fn(),
  loadOrCreate: vi.fn(),
  initializeEngine: vi.fn(),
  clearRuntime: vi.fn(),
  materialize: vi.fn(),
  hasTables: vi.fn(),
  flushReports: vi.fn(),
  loadReports: vi.fn(),
}))
const reportStore = vi.hoisted(() => {
  const state = {
    reports: {},
    selectedReportId: null as string | null,
    activeProjectId: null as string | null,
    persistenceStatus: 'idle',
    persistenceError: null as string | null,
    flushSaves: mocks.flushReports,
    reset: vi.fn(),
  }
  return {
    state,
    getState: () => state,
    setState: (update: Partial<typeof state>) => Object.assign(state, update),
  }
})
const user = {
  id: 'user',
  email: 'user@example.com',
  name: 'User',
  tier: 'google' as const,
  createdAt: new Date(),
}

vi.mock('./useAuthState', () => ({
  useAuthState: () => ({
    user,
    isAuthenticated: true,
    performCheckAuth: vi.fn().mockResolvedValue({ user, shouldContinue: true }),
    performLogin: vi.fn(),
    performGoogleLogin: vi.fn(),
    performLogout: vi.fn(),
  }),
}))
vi.mock('@/persistence/syncService', () => ({
  createProjectWithSync: vi.fn(),
  deleteProjectWithSync: vi.fn(),
  fetchProjects: vi.fn(),
  flushProjectSaveWithSync: mocks.flushProjectSave,
  importProjectWithSync: vi.fn(),
  loadProjectWithSync: mocks.loadProject,
  saveProjectWithSync: mocks.saveProject,
  setProjectSyncErrorHandler: vi.fn(),
  syncLocalProjectsToBackend: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./projectLifecycle', () => ({
  clearProjectRuntime: mocks.clearRuntime,
  hasProjectTables: mocks.hasTables,
  initializeEngine: mocks.initializeEngine,
  loadOrCreateProject: mocks.loadOrCreate,
  materializeProjectTables: mocks.materialize,
}))
vi.mock('@/report/reportStore', () => ({ useReportStore: reportStore }))
vi.mock('@/persistence/reportStorage', () => ({
  deleteReportsForProject: vi.fn(),
  loadReportsForProject: mocks.loadReports,
  saveAllReports: vi.fn(),
}))

import { AppProvider } from './AppProvider'

function project(id: string, name: string, nodes = {}) {
  return { id, name, nodes, edges: {}, patches: {}, createdAt: new Date(), updatedAt: new Date() }
}

function Harness() {
  const app = useApp()
  const storeProjectId = useProjectStore(state => state.projectId)
  return (
    <div>
      <span data-testid="phase">{app.phase}</span>
      <span data-testid="project">{app.projectId}</span>
      <span data-testid="store-project">{storeProjectId}</span>
      <button onClick={() => void app.loadProject('next-project').catch(() => undefined)}>
        Load next
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  const current = project('current-project', 'Current')
  useProjectStore.setState({
    projectId: current.id,
    projectName: current.name,
    nodes: {},
    edges: {},
    patches: {},
    selectedNodeId: null,
    history: { past: [], future: [] },
  })
  Object.assign(reportStore.state, {
    reports: {},
    selectedReportId: null,
    activeProjectId: null,
    persistenceStatus: 'idle',
    persistenceError: null,
  })
  mocks.initializeEngine.mockResolvedValue(undefined)
  mocks.clearRuntime.mockResolvedValue(undefined)
  mocks.hasTables.mockReturnValue(false)
  mocks.materialize.mockResolvedValue({ completedTableIds: [], failures: [] })
  mocks.flushReports.mockResolvedValue(undefined)
  mocks.loadReports.mockResolvedValue({})
  mocks.saveProject.mockResolvedValue(undefined)
  mocks.flushProjectSave.mockResolvedValue(undefined)
  mocks.loadOrCreate.mockResolvedValue({
    project: current,
    projectList: [current],
  })
  mocks.loadProject.mockResolvedValue(project('next-project', 'Next'))
})

async function renderReady(): Promise<void> {
  render(<AppProvider><Harness /></AppProvider>)
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))
}

describe('AppProvider transition failures', () => {
  it('blocks switching when local durability fails', async () => {
    await renderReady()
    mocks.saveProject.mockRejectedValue(new Error('IndexedDB unavailable'))

    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))

    await waitFor(() => expect(mocks.saveProject).toHaveBeenCalled())
    expect(mocks.loadProject).not.toHaveBeenCalled()
    expect(screen.getByTestId('project')).toHaveTextContent('current-project')
  })

  it('propagates non-retryable remote authorization failures', async () => {
    await renderReady()
    mocks.flushProjectSave.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))

    await waitFor(() => expect(mocks.flushProjectSave).toHaveBeenCalled())
    expect(mocks.loadProject).not.toHaveBeenCalled()
    expect(screen.getByTestId('project')).toHaveTextContent('current-project')
  })

  it('leaves active stores unchanged when report staging fails', async () => {
    await renderReady()
    mocks.loadReports.mockRejectedValueOnce(new Error('Report load failed'))

    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))

    await waitFor(() => expect(mocks.loadReports).toHaveBeenCalledWith('next-project'))
    expect(screen.getByTestId('project')).toHaveTextContent('current-project')
    expect(screen.getByTestId('store-project')).toHaveTextContent('current-project')
    expect(reportStore.state.activeProjectId).toBe('current-project')
  })

  it('restores previous stores when candidate materialization fails', async () => {
    const table = {
      id: 'table',
      kind: 'source_table' as const,
      name: 'Table',
      ui: { position: { x: 0, y: 0 } },
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      plan: {
        fileRef: 'file',
        fileName: 'data.csv',
        fileType: 'csv' as const,
        inferredSchemaVersion: 1,
      },
    }
    mocks.loadProject.mockResolvedValueOnce(project('next-project', 'Next', { table }))
    mocks.hasTables.mockImplementation(nodes => Object.keys(nodes).length > 0)
    mocks.materialize.mockResolvedValueOnce({
      completedTableIds: [],
      failures: [{ tableId: 'table', error: 'materialization failed' }],
    })
    await renderReady()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Load next' }))
    })

    await waitFor(() => expect(mocks.materialize).toHaveBeenCalled())
    expect(screen.getByTestId('project')).toHaveTextContent('current-project')
    expect(screen.getByTestId('store-project')).toHaveTextContent('current-project')
    expect(reportStore.state.activeProjectId).toBe('current-project')
  })
})
