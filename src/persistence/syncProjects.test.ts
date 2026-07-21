import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from './syncServiceTestSupport'
import { ApiError } from '@/api/client'

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(), getProject: vi.fn(), createProject: vi.fn(),
  updateProject: vi.fn(), deleteProject: vi.fn(), saveProjectLocal: vi.fn(),
  loadProjectLocal: vi.fn(), listProjectsLocal: vi.fn(),
  deleteProjectLocal: vi.fn(), updateProjectRevision: vi.fn(),
  copyReportsToProject: vi.fn(), deleteReportsForProject: vi.fn(),
  loadReportsForProject: vi.fn(),
  operations: new Map<string, Record<string, unknown>>(),
  saveProjectAndEnqueue: vi.fn(),
  enqueueProjectSave: vi.fn(), enqueueProjectDelete: vi.fn(),
  getProjectSyncOperation: vi.fn(), listProjectSyncOperations: vi.fn(),
  acknowledgeProjectSave: vi.fn(), finalizeProjectDelete: vi.fn(),
  clearProjectSyncOperation: vi.fn(),
}))

vi.mock('@/api/projects.api', () => ({
  listProjects: () => mocks.listProjects(),
  getProject: (id: string) => mocks.getProject(id),
  createProject: (data: unknown, operationId?: string) => mocks.createProject(data, operationId),
  updateProject: (id: string, data: unknown) => mocks.updateProject(id, data),
  deleteProject: (id: string, revision: number) => mocks.deleteProject(id, revision),
}))
vi.mock('./projectSyncQueue', () => ({
  saveProjectAndEnqueue: (...args: unknown[]) => mocks.saveProjectAndEnqueue(...args),
  enqueueProjectSave: (...args: unknown[]) => mocks.enqueueProjectSave(...args),
  enqueueProjectDelete: (...args: unknown[]) => mocks.enqueueProjectDelete(...args),
  getProjectSyncOperation: (...args: unknown[]) => mocks.getProjectSyncOperation(...args),
  listProjectSyncOperations: (...args: unknown[]) => mocks.listProjectSyncOperations(...args),
  acknowledgeProjectSave: (...args: unknown[]) => mocks.acknowledgeProjectSave(...args),
  finalizeProjectDelete: (...args: unknown[]) => mocks.finalizeProjectDelete(...args),
  clearProjectSyncOperation: (...args: unknown[]) => mocks.clearProjectSyncOperation(...args),
}))

vi.mock('./db', () => ({
  saveProject: (...args: unknown[]) => mocks.saveProjectLocal(...args),
  loadProject: (id: string) => mocks.loadProjectLocal(id),
  listProjects: (scope?: string) => mocks.listProjectsLocal(scope),
  deleteProject: (...args: unknown[]) => mocks.deleteProjectLocal(...args),
  updateProjectRevision: (...args: unknown[]) => mocks.updateProjectRevision(...args),
}))
vi.mock('./reportStorage', () => ({
  copyReportsToProject: (...args: unknown[]) => mocks.copyReportsToProject(...args),
  deleteReportsForProject: (...args: unknown[]) => mocks.deleteReportsForProject(...args),
  loadReportsForProject: (...args: unknown[]) => mocks.loadReportsForProject(...args),
  replaceReportsForProject: vi.fn(),
}))

import {
  fetchProjects, flushProjectSaveWithSync, loadProjectWithSync,
  saveProjectWithSync,
} from './syncService'
import { accountStorageScope, setStorageScope } from './storageScope'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.listProjectsLocal.mockResolvedValue([])
  mocks.loadProjectLocal.mockResolvedValue(null)
  mocks.loadReportsForProject.mockResolvedValue({})
  mocks.operations.clear()
  mocks.enqueueProjectSave.mockImplementation((
    id: string,
    payload: Record<string, unknown>,
    expectedRevision: number,
  ) => {
    const previous = mocks.operations.get(id)
    const operation = {
      projectId: id,
      generation: Number(previous?.generation ?? 0) + 1,
      expectedRevision,
      operation: 'save',
      payload,
    }
    mocks.operations.set(id, operation)
    return operation
  })
  mocks.saveProjectAndEnqueue.mockImplementation((
    id: string,
    name: string,
    nodes: Record<string, unknown>,
    edges: Record<string, unknown>,
    patches: Record<string, unknown>,
    reports: Record<string, unknown>,
  ) => mocks.enqueueProjectSave(id, {
    name,
    nodes,
    edges,
    patches,
    reports,
  }, 0))
  mocks.enqueueProjectDelete.mockImplementation((id: string, expectedRevision: number) => {
    const operation = {
      projectId: id,
      generation: 1,
      expectedRevision,
      operation: 'delete',
    }
    mocks.operations.set(id, operation)
    return operation
  })
  mocks.getProjectSyncOperation.mockImplementation((id: string) => (
    mocks.operations.get(id) ?? null
  ))
  mocks.listProjectSyncOperations.mockImplementation(() => (
    [...mocks.operations.values()]
  ))
  mocks.acknowledgeProjectSave.mockImplementation((id: string) => {
    mocks.operations.delete(id)
  })
  mocks.finalizeProjectDelete.mockImplementation((id: string) => {
    mocks.operations.delete(id)
    return {}
  })
  mocks.clearProjectSyncOperation.mockImplementation((id: string) => {
    mocks.operations.delete(id)
  })
  mocks.updateProject.mockImplementation((id: string, data: { expectedRevision?: number }) => ({
    ...createMockProject(id, 'Updated'),
    revision: (data.expectedRevision ?? 0) + 1,
  }))
  setStorageScope(accountStorageScope('test-user'))
})

afterEach(() => {
  vi.useRealTimers()
  window.dispatchEvent(new Event('online'))
})

const {
  getProject: mockGetProject, listProjects: mockListProjects,
  listProjectsLocal: mockListProjectsLocal, loadProjectLocal: mockLoadProjectLocal,
  saveProjectLocal: mockSaveProjectLocal, updateProject: mockUpdateProject,
} = mocks

describe('fetchProjects', () => {
  it('fetches from API when online', async () => {
    mockListProjects.mockResolvedValue([
      createMockProject('proj_1', 'Project 1'),
      createMockProject('proj_2', 'Project 2'),
    ])
    const result = await fetchProjects()
    expect(mockListProjects).toHaveBeenCalled()
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Project 1')
  })

  it('falls back to local storage when API fails', async () => {
    mockListProjects.mockRejectedValue(new TypeError('Network error'))
    mockListProjectsLocal.mockResolvedValue([
      { id: 'local_1', name: 'Local Project', updatedAt: new Date().toISOString() },
    ])
    const result = await fetchProjects()
    expect(mockListProjectsLocal).toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Local Project')
  })
  it('does not hide an authorization failure behind cached projects', async () => {
    mockListProjects.mockRejectedValue(new ApiError('Sign in required', 401))
    await expect(fetchProjects()).rejects.toMatchObject({ statusCode: 401 })
  })
  it('keeps queued cached metadata and includes unsynced local projects', async () => {
    const remote = createMockProject('proj_1', 'Remote name')
    remote.updatedAt = new Date('2026-01-01T00:00:00.000Z')
    mockListProjects.mockResolvedValue([remote])
    mockListProjectsLocal.mockResolvedValue([
      {
        id: 'proj_1',
        name: 'Newer local name',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'local_1',
        name: 'Offline project',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ])
    mocks.operations.set('proj_1', {
      projectId: 'proj_1',
      generation: 1,
      expectedRevision: 0,
      operation: 'save',
    })

    const result = await fetchProjects()

    expect(result.map(project => project.id)).toEqual(['local_1', 'proj_1'])
    expect(result[1].name).toBe('Newer local name')
  })
})
describe('loadProjectWithSync', () => {
  it('loads from API and caches locally when online', async () => {
    mockGetProject.mockResolvedValue(createMockProject('proj_123', 'Test Project'))
    const result = await loadProjectWithSync('proj_123')
    expect(mockGetProject).toHaveBeenCalledWith('proj_123')
    expect(mockSaveProjectLocal).toHaveBeenCalled()
    expect(result?.name).toBe('Test Project')
    expect(result?.isLocalOnly).toBe(false)
  })

  it('falls back to local when API fails', async () => {
    mockGetProject.mockRejectedValue(new TypeError('Network error'))
    mockLoadProjectLocal.mockResolvedValue({
      id: 'proj_123',
      name: 'Local Cached Project',
      nodes: {},
      edges: {},
      patches: {},
    })
    const result = await loadProjectWithSync('proj_123')
    expect(mockLoadProjectLocal).toHaveBeenCalledWith('proj_123')
    expect(result?.name).toBe('Local Cached Project')
    expect(result).not.toBeNull()
  })
  it('does not load stale local data after an authorization failure', async () => {
    mockGetProject.mockRejectedValue(new ApiError('Forbidden', 403))
    await expect(loadProjectWithSync('proj_123')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('returns null when project not found anywhere', async () => {
    mockGetProject.mockRejectedValue(new TypeError('Network error'))
    mockLoadProjectLocal.mockResolvedValue(null)
    expect(await loadProjectWithSync('nonexistent')).toBeNull()
  })

  it('uploads an explicitly queued local project instead of overwriting it', async () => {
    const remote = createMockProject('proj_123', 'Stale remote project')
    remote.updatedAt = new Date('2026-01-01T00:00:00.000Z')
    mockGetProject.mockResolvedValue(remote)
    mockLoadProjectLocal.mockResolvedValue({
      id: 'proj_123',
      name: 'Newer local project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    mocks.operations.set('proj_123', {
      projectId: 'proj_123',
      generation: 1,
      expectedRevision: 0,
      operation: 'save',
      payload: {
        name: 'Newer local project',
        nodes: {},
        edges: {},
        patches: {},
        reports: {},
      },
    })

    const result = await loadProjectWithSync('proj_123')

    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_123',
      expect.objectContaining({ name: 'Newer local project' }),
    )
    expect(result?.name).toBe('Newer local project')
    expect(result?.needsSync).toBe(false)
    expect(mockSaveProjectLocal).not.toHaveBeenCalled()
  })

  it('loads local-only projects without making a doomed backend request', async () => {
    mockLoadProjectLocal.mockResolvedValue({
      id: 'local_123',
      name: 'Offline project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    const result = await loadProjectWithSync('local_123')

    expect(mockGetProject).not.toHaveBeenCalled()
    expect(result?.isLocalOnly).toBe(true)
    expect(result?.needsSync).toBe(true)
  })
})
describe('saveProjectWithSync', () => {
  it('durably queues the local snapshot and debounces backend save', async () => {
    await saveProjectWithSync('proj_1', 'Test', {}, {}, {})
    expect(mocks.saveProjectAndEnqueue).toHaveBeenCalledWith(
      'proj_1',
      'Test',
      {},
      {},
      {},
      {},
      accountStorageScope('test-user'),
    )
    expect(mockUpdateProject).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({ name: 'Test' }),
    )
  })
  it('does not sync local-only projects to backend', async () => {
    await saveProjectWithSync('local_123', 'Local Project', {}, {}, {})
    expect(mockSaveProjectLocal).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockUpdateProject).not.toHaveBeenCalled()
  })

  it('debounces multiple rapid saves', async () => {
    await saveProjectWithSync('proj_1', 'Version 1', {}, {}, {})
    await saveProjectWithSync('proj_1', 'Version 2', {}, {}, {})
    await saveProjectWithSync('proj_1', 'Version 3', {}, {}, {})
    await vi.advanceTimersByTimeAsync(2500)
    expect(mockUpdateProject).toHaveBeenCalledTimes(1)
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({ name: 'Version 3' }),
    )
  })

  it('retains a pending backend save after a remote failure so it can retry', async () => {
    await saveProjectWithSync('proj_1', 'Important edit', {}, {}, {})
    mockUpdateProject.mockRejectedValueOnce(new Error('Remote save failed'))

    await expect(flushProjectSaveWithSync('proj_1')).rejects.toThrow(
      'Remote save failed',
    )
    mockUpdateProject.mockResolvedValueOnce({
      ...createMockProject('proj_1', 'Important edit'),
      revision: 1,
    })
    await flushProjectSaveWithSync('proj_1')

    expect(mockUpdateProject).toHaveBeenCalledTimes(2)
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({ name: 'Important edit' }),
    )
  })

  it('keeps a durable save queued while offline and flushes it on reconnect', async () => {
    await saveProjectWithSync('proj_1', 'Offline edit', {}, {}, {})
    window.dispatchEvent(new Event('offline'))

    await flushProjectSaveWithSync('proj_1')

    expect(mockUpdateProject).not.toHaveBeenCalled()
    expect(mocks.operations.get('proj_1')).toMatchObject({
      payload: { name: 'Offline edit' },
    })

    window.dispatchEvent(new Event('online'))
    await flushProjectSaveWithSync('proj_1')
    expect(mockUpdateProject).toHaveBeenCalledTimes(1)
    expect(mocks.operations.has('proj_1')).toBe(false)
  })
})
