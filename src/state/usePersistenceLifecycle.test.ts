import { beforeEach, describe, expect, it, vi } from 'vitest'

const sync = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  flushAllProjectSavesWithSync: vi.fn(),
  loadProjectWithSync: vi.fn(),
  syncLocalProjectsToBackend: vi.fn(),
}))
const flushReportSaves = vi.hoisted(() => vi.fn())
const projectState = vi.hoisted(() => ({ projectId: 'project-1' as string | null }))

vi.mock('@/persistence/syncService', () => sync)
vi.mock('@/report/reportStore', () => ({
  useReportStore: {
    getState: () => ({ flushSaves: flushReportSaves }),
  },
}))
vi.mock('./projectStore', () => ({
  useProjectStore: {
    getState: () => projectState,
  },
}))
vi.mock('./tabOwnership', () => ({
  setBeforeTabRelease: vi.fn(),
}))

import { synchronizeAfterReconnect } from './usePersistenceLifecycle'

describe('reconnect persistence recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectState.projectId = 'project-1'
    flushReportSaves.mockResolvedValue(undefined)
    sync.fetchProjects.mockResolvedValue([])
    sync.syncLocalProjectsToBackend.mockResolvedValue([])
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
})
