import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SetStateAction } from 'react'
import type { AppProviderState } from '@/state/app-session/appContextValue'

const sync = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  flushAllProjectSavesWithSync: vi.fn(),
  loadProjectWithSync: vi.fn(),
  syncOfflineAccountProjects: vi.fn(),
}))
const flushReportSaves = vi.hoisted(() => vi.fn())
const projectState = vi.hoisted(() => ({ projectId: 'project-1' as string | null }))

vi.mock('@/persistence/sync/session/syncService', () => sync)
vi.mock('@/report/reportStore', () => ({
  useReportStore: {
    getState: () => ({ flushSaves: flushReportSaves }),
  },
}))
vi.mock('@/state/projectStore', () => ({
  useProjectStore: {
    getState: () => projectState,
  },
}))
import { synchronizeAfterReconnect } from '@/state/app-session/persistence/usePersistenceLifecycle'

function appState(): AppProviderState {
  return {
    phase: 'ready',
    phaseMessage: '',
    engineReady: true,
    user: null,
    isAuthenticated: true,
    projectId: 'project-1',
    projectName: 'Project 1',
    projects: [{
      id: 'project-1',
      name: 'Project 1',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }],
    isSaving: false,
    isProjectOperationPending: false,
    error: null,
    syncError: null,
  }
}

describe('reconnect persistence recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectState.projectId = 'project-1'
    flushReportSaves.mockResolvedValue(undefined)
    sync.fetchProjects.mockResolvedValue([])
    sync.syncOfflineAccountProjects.mockResolvedValue([])
    sync.flushAllProjectSavesWithSync.mockResolvedValue([])
  })

  it('refreshes the active in-memory project after resolving its conflict', async () => {
    const recovered = {
      id: 'project-1',
      name: 'Newer cloud project',
      nodes: {},
      edges: {},
      patches: {},
      reports: {},
      revision: 4,
    }
    sync.flushAllProjectSavesWithSync.mockResolvedValue([
      { projectId: 'project-1', operation: 'save' },
    ])
    sync.loadProjectWithSync.mockResolvedValue(recovered)
    const prepareProject = vi.fn().mockResolvedValue(undefined)

    await synchronizeAfterReconnect({
      saveLatestProject: vi.fn().mockResolvedValue(undefined),
      prepareProject,
      setState: vi.fn(),
    })

    expect(sync.loadProjectWithSync).toHaveBeenCalledWith('project-1')
    expect(prepareProject).toHaveBeenCalledWith(recovered)
  })

  it('does not reload an unrelated active project', async () => {
    sync.flushAllProjectSavesWithSync.mockResolvedValue([
      { projectId: 'project-2', operation: 'save' },
    ])
    const prepareProject = vi.fn()

    await synchronizeAfterReconnect({
      saveLatestProject: vi.fn().mockResolvedValue(undefined),
      prepareProject,
      setState: vi.fn(),
    })

    expect(sync.loadProjectWithSync).not.toHaveBeenCalled()
    expect(prepareProject).not.toHaveBeenCalled()
  })

  it('keeps the known catalog when a reconnect fetch is transiently empty', async () => {
    let state = appState()
    const setState = vi.fn((update: SetStateAction<AppProviderState>) => {
      state = typeof update === 'function' ? update(state) : update
    })

    await synchronizeAfterReconnect({
      saveLatestProject: vi.fn().mockResolvedValue(undefined),
      prepareProject: vi.fn(),
      setState,
    })

    expect(state.projects).toEqual(appState().projects)
    expect(state.projectId).toBe('project-1')
  })
})
