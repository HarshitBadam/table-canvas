import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from './appContextValue'
import { useProjectStore } from './projectStore'

const saveProjectWithSync = vi.hoisted(() => vi.fn())
const flushProjectSaveWithSync = vi.hoisted(() => vi.fn())
const deleteProjectWithSync = vi.hoisted(() => vi.fn())
const loadProjectWithSync = vi.hoisted(() => vi.fn())
const loadOrCreateProject = vi.hoisted(() => vi.fn())
const initializeEngine = vi.hoisted(() => vi.fn())
const clearProjectRuntime = vi.hoisted(() => vi.fn())
const materializeProjectTables = vi.hoisted(() => vi.fn())
const hasProjectTables = vi.hoisted(() => vi.fn())
const flushReportSaves = vi.hoisted(() => vi.fn())
const loadReportsForProject = vi.hoisted(() => vi.fn())
const deleteReportsForProject = vi.hoisted(() => vi.fn())
const saveAllReports = vi.hoisted(() => vi.fn())
const reportStore = vi.hoisted(() => {
  const state = {
    reports: {},
    selectedReportId: null as string | null,
    activeProjectId: null as string | null,
    persistenceStatus: 'idle',
    persistenceError: null as string | null,
    flushSaves: flushReportSaves,
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
  deleteProjectWithSync,
  fetchProjects: vi.fn().mockResolvedValue([]),
  flushProjectSaveWithSync,
  loadProjectWithSync,
  saveProjectWithSync,
  setProjectSyncErrorHandler: vi.fn(),
  syncLocalProjectsToBackend: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./projectLifecycle', () => ({
  clearProjectRuntime,
  hasProjectTables,
  initializeEngine,
  loadOrCreateProject,
  materializeProjectTables,
}))
vi.mock('@/report/reportStore', () => ({
  useReportStore: reportStore,
}))
vi.mock('@/persistence/reportStorage', () => ({
  deleteReportsForProject,
  loadReportsForProject,
  saveAllReports,
}))
vi.mock('@/engine', () => ({
  getEngine: () => ({ dropTable: vi.fn() }),
}))

import { AppProvider } from './AppProvider'

function project(id: string, name: string) {
  return {
    id,
    name,
    nodes: {},
    edges: {},
    patches: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function Harness() {
  const app = useApp()
  const storeProjectId = useProjectStore(state => state.projectId)
  return (
    <div>
      <span data-testid="phase">{app.phase}</span>
      <span data-testid="project">{app.projectId}</span>
      <span data-testid="store-project">{storeProjectId}</span>
      <span data-testid="project-name">{app.projectName}</span>
      <button onClick={() => void app.loadProject('next-project').catch(() => undefined)}>
        Load next
      </button>
      <button onClick={() => app.renameProject('Renamed project')}>Rename</button>
      <button onClick={() => void app.deleteProject('current-project').catch(() => undefined)}>
        Delete current
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  const current = project('current-project', 'Current')
  const next = project('next-project', 'Next')
  useProjectStore.setState({
    projectId: current.id,
    projectName: current.name,
    nodes: {},
    edges: {},
    patches: {},
    selectedNodeId: null,
    history: { past: [], future: [] },
  })
  initializeEngine.mockResolvedValue(undefined)
  clearProjectRuntime.mockResolvedValue(undefined)
  hasProjectTables.mockReturnValue(false)
  materializeProjectTables.mockResolvedValue({ completedTableIds: [], failures: [] })
  loadReportsForProject.mockResolvedValue({})
  Object.assign(reportStore.state, {
    reports: {},
    selectedReportId: null,
    activeProjectId: null,
    persistenceStatus: 'idle',
    persistenceError: null,
  })
  flushReportSaves.mockResolvedValue(undefined)
  saveProjectWithSync.mockResolvedValue(undefined)
  flushProjectSaveWithSync.mockResolvedValue(undefined)
  deleteProjectWithSync.mockResolvedValue(undefined)
  deleteReportsForProject.mockResolvedValue(undefined)
  saveAllReports.mockResolvedValue(undefined)
  loadOrCreateProject.mockResolvedValue({ project: current, projectList: [current] })
  loadProjectWithSync.mockResolvedValue(next)
})

describe('AppProvider project lifecycle', () => {
  it('renames the active project and persists the new name', async () => {
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))
    saveProjectWithSync.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(screen.getByTestId('project-name')).toHaveTextContent('Renamed project')
    await waitFor(() => {
      expect(saveProjectWithSync).toHaveBeenCalledWith(
        'current-project',
        'Renamed project',
        {},
        {},
        {},
        {},
      )
    })
  })

  it('persists project mutations immediately so a reload cannot beat local saving', async () => {
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))
    saveProjectWithSync.mockClear()

    act(() => {
      useProjectStore.setState({ projectName: 'Immediately durable' })
    })

    await waitFor(() => {
      expect(saveProjectWithSync).toHaveBeenCalledWith(
        'current-project',
        'Immediately durable',
        {},
        {},
        {},
        {},
      )
    })
  })

  it('flushes the current project and report saves before switching projects', async () => {
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))

    act(() => {
      useProjectStore.setState({ projectName: 'Unsaved current name' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))

    await waitFor(() => {
      expect(screen.getByTestId('project')).toHaveTextContent('next-project')
    })
    expect(saveProjectWithSync).toHaveBeenCalledWith(
      'current-project',
      'Unsaved current name',
      {},
      {},
      {},
      {},
    )
    expect(flushReportSaves).toHaveBeenCalledOnce()
    expect(flushProjectSaveWithSync).toHaveBeenCalledWith('current-project')
    expect(saveProjectWithSync.mock.invocationCallOrder[0])
      .toBeLessThan(loadProjectWithSync.mock.invocationCallOrder[0])
    expect(flushReportSaves.mock.invocationCallOrder[0])
      .toBeLessThan(loadProjectWithSync.mock.invocationCallOrder[0])
  })

  it('still switches from the local save when the remote flush is unavailable', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    flushProjectSaveWithSync.mockRejectedValueOnce(new TypeError('Load failed'))
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))

    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))

    await waitFor(() => {
      expect(screen.getByTestId('project')).toHaveTextContent('next-project')
      expect(screen.getByTestId('phase')).toHaveTextContent('ready')
    })
    expect(saveProjectWithSync).toHaveBeenCalled()
    expect(loadProjectWithSync).toHaveBeenCalledWith('next-project')
    expect(warning).toHaveBeenCalledWith(
      '[AppContext] Retryable remote save deferred:',
      expect.any(Error),
    )
    warning.mockRestore()
  })

  it('keeps the current workspace ready while the next project loads', async () => {
    const next = project('next-project', 'Next')
    let resolveLoad!: (value: typeof next) => void
    loadProjectWithSync.mockReturnValueOnce(new Promise((resolve) => {
      resolveLoad = resolve
    }))
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))

    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))
    await waitFor(() => expect(loadProjectWithSync).toHaveBeenCalledWith('next-project'))

    expect(screen.getByTestId('phase')).toHaveTextContent('ready')
    expect(screen.getByTestId('project')).toHaveTextContent('current-project')

    resolveLoad(next)
    await waitFor(() => {
      expect(screen.getByTestId('project')).toHaveTextContent('next-project')
    })
  })

  it('locks concurrent project operations before async work starts', async () => {
    const next = project('next-project', 'Next')
    let resolveLoad!: (value: typeof next) => void
    loadProjectWithSync.mockReturnValueOnce(new Promise((resolve) => {
      resolveLoad = resolve
    }))
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))

    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))

    await waitFor(() => expect(loadProjectWithSync).toHaveBeenCalledOnce())
    resolveLoad(next)
    await waitFor(() => expect(screen.getByTestId('project')).toHaveTextContent('next-project'))
  })

  it('keeps the app mounted while tables materialize during a switch', async () => {
    let resolveMaterialization!: () => void
    hasProjectTables.mockReturnValueOnce(false).mockReturnValue(true)
    materializeProjectTables.mockReturnValueOnce(new Promise((resolve) => {
      resolveMaterialization = () => resolve({ completedTableIds: [], failures: [] })
    }))
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))

    fireEvent.click(screen.getByRole('button', { name: 'Load next' }))
    await waitFor(() => {
      expect(screen.getByTestId('store-project')).toHaveTextContent('next-project')
    })

    expect(screen.getByTestId('phase')).toHaveTextContent('ready')
    resolveMaterialization()
    await waitFor(() => {
      expect(screen.getByTestId('project')).toHaveTextContent('next-project')
    })
  })

  it('restores the active project when report cleanup fails during delete', async () => {
    const current = project('current-project', 'Current')
    const next = project('next-project', 'Next')
    loadOrCreateProject.mockResolvedValueOnce({
      project: current,
      projectList: [current, next],
    })
    deleteReportsForProject.mockRejectedValueOnce(new Error('Report cleanup failed'))
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))

    fireEvent.click(screen.getByRole('button', { name: 'Delete current' }))

    await waitFor(() => expect(deleteReportsForProject).toHaveBeenCalledWith('current-project'))
    expect(deleteProjectWithSync).not.toHaveBeenCalled()
    expect(screen.getByTestId('project')).toHaveTextContent('current-project')
    expect(screen.getByTestId('store-project')).toHaveTextContent('current-project')
  })

  it('restores reports and active stores when local project deletion fails', async () => {
    const current = project('current-project', 'Current')
    const next = project('next-project', 'Next')
    loadOrCreateProject.mockResolvedValueOnce({
      project: current,
      projectList: [current, next],
    })
    deleteProjectWithSync.mockRejectedValueOnce(new Error('IndexedDB delete failed'))
    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'))

    fireEvent.click(screen.getByRole('button', { name: 'Delete current' }))

    await waitFor(() => expect(deleteProjectWithSync).toHaveBeenCalledWith('current-project'))
    expect(saveAllReports).toHaveBeenCalledWith({})
    expect(screen.getByTestId('project')).toHaveTextContent('current-project')
    expect(screen.getByTestId('store-project')).toHaveTextContent('current-project')
  })
})
