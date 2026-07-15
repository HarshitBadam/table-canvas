import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from './appContextValue'
import { useProjectStore } from './projectStore'

const saveProjectWithSync = vi.hoisted(() => vi.fn())
const flushProjectSaveWithSync = vi.hoisted(() => vi.fn())
const loadProjectWithSync = vi.hoisted(() => vi.fn())
const loadOrCreateProject = vi.hoisted(() => vi.fn())
const initializeEngine = vi.hoisted(() => vi.fn())
const clearProjectRuntime = vi.hoisted(() => vi.fn())
const materializeProjectTables = vi.hoisted(() => vi.fn())
const initializeReports = vi.hoisted(() => vi.fn())
const flushReportSaves = vi.hoisted(() => vi.fn())

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
  fetchProjects: vi.fn().mockResolvedValue([]),
  flushProjectSaveWithSync,
  loadProjectWithSync,
  saveProjectWithSync,
  syncLocalProjectsToBackend: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./projectLifecycle', () => ({
  clearProjectRuntime,
  initializeEngine,
  loadOrCreateProject,
  materializeProjectTables,
}))
vi.mock('@/report/reportStore', () => ({
  useReportStore: {
    getState: () => ({
      initializeProject: initializeReports,
      flushSaves: flushReportSaves,
      reset: vi.fn(),
    }),
  },
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
  return (
    <div>
      <span data-testid="phase">{app.phase}</span>
      <span data-testid="project">{app.projectId}</span>
      <span data-testid="project-name">{app.projectName}</span>
      <button onClick={() => void app.loadProject('next-project')}>Load next</button>
      <button onClick={() => app.renameProject('Renamed project')}>Rename</button>
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
  materializeProjectTables.mockResolvedValue({ completedTableIds: [], failures: [] })
  initializeReports.mockResolvedValue(undefined)
  flushReportSaves.mockResolvedValue(undefined)
  saveProjectWithSync.mockResolvedValue(undefined)
  flushProjectSaveWithSync.mockResolvedValue(undefined)
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
    )
    expect(flushReportSaves).toHaveBeenCalledOnce()
    expect(flushProjectSaveWithSync).toHaveBeenCalledWith('current-project')
    expect(saveProjectWithSync.mock.invocationCallOrder[0])
      .toBeLessThan(loadProjectWithSync.mock.invocationCallOrder[0])
    expect(flushReportSaves.mock.invocationCallOrder[0])
      .toBeLessThan(loadProjectWithSync.mock.invocationCallOrder[0])
  })
})
