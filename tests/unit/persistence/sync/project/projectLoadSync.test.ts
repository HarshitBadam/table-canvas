import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from '@/persistence/sync/session/syncServiceTestSupport'
import { ApiError } from '@/api/client'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  saveProjectLocal: vi.fn(),
  loadProjectLocal: vi.fn(),
  replaceReportsForProject: vi.fn(),
  flushProjectSaveWithSync: vi.fn(),
  reportProjectSyncError: vi.fn(),
  getProjectSyncOperation: vi.fn(),
  cancelQueuedProjectDelete: vi.fn(),
  captureProjectSyncBase: vi.fn(),
  publishCatalogChanged: vi.fn(),
}))

vi.mock('@/api/projects.api', () => ({
  getProject: (id: string) => mocks.getProject(id),
}))

vi.mock('@/persistence/storage/local-db/db', () => ({
  saveProject: (...args: unknown[]) => mocks.saveProjectLocal(...args),
  loadProject: (...args: unknown[]) => mocks.loadProjectLocal(...args),
}))

vi.mock('@/persistence/storage/local-db/reportStorage', () => ({
  replaceReportsForProject: (...args: unknown[]) => mocks.replaceReportsForProject(...args),
}))

vi.mock('@/persistence/sync/project/save/projectSaveSync', () => ({
  flushProjectSaveWithSync: (...args: unknown[]) => mocks.flushProjectSaveWithSync(...args),
  reportProjectSyncError: (...args: unknown[]) => mocks.reportProjectSyncError(...args),
}))

vi.mock('@/persistence/sync/project/save/projectSyncQueue', () => ({
  getProjectSyncOperation: (...args: unknown[]) => mocks.getProjectSyncOperation(...args),
  cancelQueuedProjectDelete: (...args: unknown[]) => mocks.cancelQueuedProjectDelete(...args),
}))

vi.mock('@/persistence/sync/project/save/projectSyncBase', () => ({
  captureProjectSyncBase: (...args: unknown[]) => mocks.captureProjectSyncBase(...args),
  remoteProjectSnapshot: (project: unknown) => project,
}))

vi.mock('@/persistence/sync/project/projectCatalog', () => ({
  publishCatalogChanged: (...args: unknown[]) => mocks.publishCatalogChanged(...args),
}))

import { loadProjectWithSync } from '@/persistence/sync/project/projectLoadSync'
import { accountStorageScope, setStorageScope } from '@/persistence/storage/storageScope'

const accountScope = accountStorageScope('load-sync-user')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadProjectLocal.mockResolvedValue(null)
  mocks.getProjectSyncOperation.mockResolvedValue(null)
  setStorageScope(accountScope)
})

afterEach(() => {
  window.dispatchEvent(new Event('online'))
})

describe('loadProjectWithSync: queued delete reconciliation', () => {
  it('cancels a stale queued delete on conflict and falls through to the current cloud copy', async () => {
    mocks.getProjectSyncOperation.mockResolvedValue({
      projectId: 'proj_123',
      generation: 1,
      expectedRevision: 0,
      operation: 'delete',
    })
    mocks.flushProjectSaveWithSync.mockRejectedValueOnce(new ApiError('Conflict', 409))
    mocks.getProject.mockResolvedValue(createMockProject('proj_123', 'Changed in cloud'))

    const result = await loadProjectWithSync('proj_123')

    expect(mocks.cancelQueuedProjectDelete).toHaveBeenCalledWith(
      'proj_123',
      accountScope,
      1,
      expect.objectContaining({ scope: accountScope }),
    )
    expect(mocks.publishCatalogChanged).toHaveBeenCalledWith(accountScope)
    expect(result?.name).toBe('Changed in cloud')
    expect(mocks.saveProjectLocal).toHaveBeenCalled()
  })

  it('gives up the delete and rejects when the failure is not retryable', async () => {
    mocks.getProjectSyncOperation.mockResolvedValue({
      projectId: 'proj_123',
      generation: 1,
      expectedRevision: 0,
      operation: 'delete',
    })
    mocks.flushProjectSaveWithSync.mockRejectedValueOnce(new Error('Boom'))

    await expect(loadProjectWithSync('proj_123')).rejects.toThrow('Boom')
    expect(mocks.cancelQueuedProjectDelete).not.toHaveBeenCalled()
  })

  it('stays queued for retry when the delete flush is deferred by the backend', async () => {
    mocks.getProjectSyncOperation.mockResolvedValue({
      projectId: 'proj_123',
      generation: 1,
      expectedRevision: 0,
      operation: 'delete',
    })
    mocks.flushProjectSaveWithSync.mockRejectedValueOnce(new ApiError('Unavailable', 503))

    const result = await loadProjectWithSync('proj_123')

    expect(result).toBeNull()
    expect(mocks.cancelQueuedProjectDelete).not.toHaveBeenCalled()
    expect(mocks.getProject).not.toHaveBeenCalled()
  })
})

describe('loadProjectWithSync: queued save reconciliation', () => {
  const localPending = {
    id: 'proj_123',
    name: 'Local pending edit',
    nodes: {},
    edges: {},
    patches: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    revision: 0,
  }

  beforeEach(() => {
    mocks.getProjectSyncOperation.mockResolvedValue({
      projectId: 'proj_123',
      generation: 1,
      expectedRevision: 0,
      operation: 'save',
      payload: { name: localPending.name, nodes: {}, edges: {}, patches: {}, reports: {} },
    })
    mocks.loadProjectLocal.mockResolvedValue(localPending)
  })

  it('keeps a queued save marked as unsynced when the flush cannot reach the backend', async () => {
    mocks.getProject.mockResolvedValue(createMockProject('proj_123', 'Cloud project'))
    mocks.flushProjectSaveWithSync.mockRejectedValue(new TypeError('Network error'))

    const result = await loadProjectWithSync('proj_123')

    expect(result).toMatchObject({
      name: 'Local pending edit',
      isLocalOnly: false,
      needsSync: true,
    })
    expect(mocks.saveProjectLocal).not.toHaveBeenCalled()
  })

  it('takes the cloud copy after a queued save conflicts instead of overwriting it', async () => {
    mocks.getProject
      .mockResolvedValueOnce(createMockProject('proj_123', 'Stale remote project'))
      .mockResolvedValueOnce(createMockProject('proj_123', 'Reconciled cloud project'))
    mocks.flushProjectSaveWithSync.mockRejectedValueOnce(new ApiError('Conflict', 409))

    const result = await loadProjectWithSync('proj_123')

    expect(mocks.getProject).toHaveBeenCalledTimes(2)
    expect(result?.name).toBe('Reconciled cloud project')
    expect(mocks.saveProjectLocal).toHaveBeenCalled()
  })

  it('uses the synced local copy once the queued save flushes successfully', async () => {
    const remote = createMockProject('proj_123', 'Stale remote project')
    mocks.getProject.mockResolvedValue(remote)
    mocks.flushProjectSaveWithSync.mockResolvedValue(undefined)
    mocks.loadProjectLocal
      .mockResolvedValueOnce(localPending)
      .mockResolvedValueOnce({ ...localPending, name: 'Synced edit', revision: 1 })

    const result = await loadProjectWithSync('proj_123')

    expect(result).toMatchObject({
      name: 'Synced edit',
      isLocalOnly: false,
      needsSync: false,
      revision: 1,
    })
    expect(mocks.saveProjectLocal).not.toHaveBeenCalled()
  })
})
