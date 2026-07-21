import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from './syncServiceTestSupport'

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  saveProjectLocal: vi.fn(),
  loadProjectLocal: vi.fn(),
  listProjectsLocal: vi.fn(),
  deleteProjectLocal: vi.fn(),
  copyReportsToProject: vi.fn(),
  deleteReportsForProject: vi.fn(),
  loadReportsForProject: vi.fn(),
  replaceReportsForProject: vi.fn(),
  enqueueProjectDelete: vi.fn(),
  getProjectSyncOperation: vi.fn(),
  finalizeProjectDelete: vi.fn(),
  clearProjectSyncOperation: vi.fn(),
  operations: new Map<string, Record<string, unknown>>(),
}))

vi.mock('@/api/projects.api', () => ({
  listProjects: () => mocks.listProjects(),
  getProject: (id: string) => mocks.getProject(id),
  createProject: (data: unknown, operationId?: string) => (
    mocks.createProject(data, operationId)
  ),
  updateProject: (id: string, data: unknown) => mocks.updateProject(id, data),
  deleteProject: (id: string, revision: number) => (
    mocks.deleteProject(id, revision)
  ),
}))

vi.mock('./projectSyncQueue', () => ({
  saveProjectAndEnqueue: vi.fn(),
  enqueueProjectDelete: (...args: unknown[]) => (
    mocks.enqueueProjectDelete(...args)
  ),
  getProjectSyncOperation: (...args: unknown[]) => (
    mocks.getProjectSyncOperation(...args)
  ),
  listProjectSyncOperations: vi.fn().mockResolvedValue([]),
  acknowledgeProjectSave: vi.fn(),
  finalizeProjectDelete: (...args: unknown[]) => (
    mocks.finalizeProjectDelete(...args)
  ),
  clearProjectSyncOperation: (...args: unknown[]) => (
    mocks.clearProjectSyncOperation(...args)
  ),
}))

vi.mock('./db', () => ({
  saveProject: (...args: unknown[]) => mocks.saveProjectLocal(...args),
  loadProject: (id: string, scope?: string) => (
    mocks.loadProjectLocal(id, scope)
  ),
  listProjects: (scope?: string) => mocks.listProjectsLocal(scope),
  deleteProject: (...args: unknown[]) => mocks.deleteProjectLocal(...args),
}))

vi.mock('./reportStorage', () => ({
  copyReportsToProject: (...args: unknown[]) => (
    mocks.copyReportsToProject(...args)
  ),
  deleteReportsForProject: (...args: unknown[]) => (
    mocks.deleteReportsForProject(...args)
  ),
  loadReportsForProject: (...args: unknown[]) => (
    mocks.loadReportsForProject(...args)
  ),
  replaceReportsForProject: (...args: unknown[]) => (
    mocks.replaceReportsForProject(...args)
  ),
}))

import {
  deleteProjectWithSync,
  importProjectWithSync,
  syncLocalProjectsToBackend,
} from './syncService'
import { accountStorageScope, setStorageScope } from './storageScope'

const accountScope = accountStorageScope('test-user')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.operations.clear()
  mocks.listProjectsLocal.mockResolvedValue([])
  mocks.loadProjectLocal.mockResolvedValue(null)
  mocks.loadReportsForProject.mockResolvedValue({})
  mocks.enqueueProjectDelete.mockImplementation((
    id: string,
    expectedRevision: number,
  ) => {
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
  mocks.finalizeProjectDelete.mockImplementation((id: string) => {
    mocks.operations.delete(id)
    return {}
  })
  mocks.clearProjectSyncOperation.mockImplementation((id: string) => {
    mocks.operations.delete(id)
  })
  mocks.updateProject.mockImplementation((
    id: string,
    data: { expectedRevision?: number },
  ) => ({
    ...createMockProject(id, 'Updated'),
    revision: (data.expectedRevision ?? 0) + 1,
  }))
  setStorageScope(accountScope)
})

afterEach(() => {
  window.dispatchEvent(new Event('online'))
})

describe('importProjectWithSync', () => {
  const importedProject = {
    name: 'Imported project',
    nodes: {},
    edges: {},
    patches: {},
  }

  it('persists the completed remote import locally', async () => {
    mocks.createProject.mockResolvedValue(createMockProject(
      'remote-import',
      importedProject.name,
    ))
    mocks.loadProjectLocal.mockImplementation((id: string) => Promise.resolve({
      id,
      name: importedProject.name,
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: id === 'remote-import' ? 1 : 0,
    }))

    const result = await importProjectWithSync(importedProject)

    expect(mocks.updateProject).toHaveBeenCalledWith(
      'remote-import',
      expect.objectContaining({ name: importedProject.name }),
    )
    expect(mocks.saveProjectLocal).toHaveBeenCalledWith(
      'remote-import',
      importedProject.name,
      {},
      {},
      {},
      expect.objectContaining({ revision: 1 }),
      accountScope,
    )
    expect(result).toMatchObject({
      id: 'remote-import',
      isLocalOnly: false,
      needsSync: false,
    })
  })

  it('keeps a local retryable import when remote promotion fails', async () => {
    mocks.createProject.mockResolvedValue(createMockProject(
      'partial-import',
      importedProject.name,
    ))
    mocks.updateProject.mockRejectedValueOnce(new TypeError('Upload failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.loadReportsForProject.mockResolvedValue({
      report: { id: 'report', name: 'Report' },
    })
    mocks.loadProjectLocal.mockImplementation((id: string) => Promise.resolve({
      id,
      name: importedProject.name,
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 0,
    }))

    const result = await importProjectWithSync({
      ...importedProject,
      reports: [{ id: 'report', name: 'Report' }],
    } as typeof importedProject)

    expect(result).toMatchObject({ isLocalOnly: true, needsSync: true })
    expect(mocks.deleteProject).not.toHaveBeenCalled()
    expect(mocks.saveProjectLocal).toHaveBeenCalled()
    expect(mocks.updateProject).toHaveBeenCalledWith('partial-import', {
      name: importedProject.name,
      nodes: {},
      edges: {},
      patches: {},
      expectedRevision: 0,
      reports: {
        report: {
          id: 'report',
          name: 'Report',
          projectId: 'partial-import',
        },
      },
    })
    errorSpy.mockRestore()
  })
})

describe('syncLocalProjectsToBackend', () => {
  it('promotes an offline project before deleting the guest source', async () => {
    mocks.listProjectsLocal.mockImplementation((scope?: string) => Promise.resolve(
      scope === 'guest'
        ? [{
            id: 'local_123',
            name: 'Offline project',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }]
        : [],
    ))
    mocks.loadProjectLocal.mockResolvedValue({
      id: 'local_123',
      name: 'Offline project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    mocks.createProject.mockResolvedValue(
      createMockProject('server_123', 'Offline project'),
    )

    await syncLocalProjectsToBackend()

    expect(mocks.createProject).toHaveBeenCalledWith(
      { name: 'Offline project' },
      'promote:guest:local_123',
    )
    expect(mocks.updateProject).toHaveBeenCalledWith(
      'server_123',
      expect.objectContaining({ name: 'Offline project' }),
    )
    expect(mocks.deleteProjectLocal).toHaveBeenCalledWith('local_123', 'guest')
    expect(mocks.saveProjectLocal).toHaveBeenCalledWith(
      'server_123',
      'Offline project',
      {},
      {},
      {},
      expect.objectContaining({ revision: 1 }),
      accountScope,
    )
    expect(mocks.updateProject.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteProjectLocal.mock.invocationCallOrder[0])
    expect(mocks.copyReportsToProject).toHaveBeenCalledWith(
      'local_123',
      'server_123',
      'guest',
      accountScope,
    )
    expect(mocks.deleteReportsForProject).toHaveBeenCalledWith(
      'local_123',
      'guest',
    )
  })
})

describe('deleteProjectWithSync', () => {
  it('queues a revisioned delete and finalizes it after backend success', async () => {
    await deleteProjectWithSync('proj_123')
    expect(mocks.enqueueProjectDelete).toHaveBeenCalledWith(
      'proj_123',
      0,
      accountScope,
    )
    expect(mocks.deleteProject).toHaveBeenCalledWith('proj_123', 0)
    expect(mocks.finalizeProjectDelete).toHaveBeenCalled()
  })

  it('does not call the backend for local-only projects', async () => {
    await deleteProjectWithSync('local_123')
    expect(mocks.enqueueProjectDelete).toHaveBeenCalledWith(
      'local_123',
      0,
      accountScope,
    )
    expect(mocks.finalizeProjectDelete).toHaveBeenCalled()
    expect(mocks.deleteProject).not.toHaveBeenCalled()
  })

  it('preserves the local project if backend deletion fails', async () => {
    mocks.loadProjectLocal.mockResolvedValue({
      id: 'proj_123',
      name: 'Project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      revision: 3,
    })
    mocks.deleteProject.mockRejectedValue(new Error('Server error'))

    await expect(deleteProjectWithSync('proj_123')).rejects.toThrow('Server error')
    expect(mocks.deleteProjectLocal).not.toHaveBeenCalled()
    expect(mocks.clearProjectSyncOperation).toHaveBeenCalledWith(
      'proj_123',
      accountScope,
    )
  })
})
