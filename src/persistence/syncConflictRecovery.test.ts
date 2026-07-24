import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDB } from './dbTestSupport'
import { createMockProject } from './syncServiceTestSupport'

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

vi.mock('@/api/projects.api', () => api)

beforeEach(() => {
  vi.clearAllMocks()
  window.dispatchEvent(new Event('online'))
})

describe('queued project conflict recovery', () => {
  it('preserves a stale save and its reports before loading the cloud version', async () => {
    const db = await getDB()
    const scope = db.accountStorageScope('conflict-user')
    db.setStorageScope(scope)
    const report = {
      id: 'report-1',
      projectId: 'project-1',
      name: 'Offline report',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    await db.saveProject(
      'project-1',
      'Offline edits',
      {},
      {},
      {},
      { revision: 0 },
      scope,
    )
    await db.enqueueProjectSave('project-1', {
      name: 'Offline edits',
      nodes: {},
      edges: {},
      patches: {},
      reports: { [report.id]: report },
    }, 0, scope)
    const remote = createMockProject('project-1', 'Cloud project')
    remote.revision = 2
    api.getProject.mockResolvedValue(remote)
    const { ApiError } = await import('@/api/client')
    api.updateProject.mockRejectedValueOnce(new ApiError('Conflict', 409))
    const { flushAllProjectSavesWithSync } = await import('./syncService')

    await expect(flushAllProjectSavesWithSync()).resolves.toEqual([
      { projectId: 'project-1', operation: 'save' },
    ])

    const projects = await db.listProjects(scope)
    const conflict = projects.find(project => project.id !== 'project-1')
    expect(conflict?.name).toBe('Offline edits (conflict copy)')
    expect((await db.loadProject('project-1', scope))?.name).toBe('Cloud project')
    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    expect(Object.values(await db.loadReportsForProject(conflict!.id, scope))[0])
      .toMatchObject({ name: 'Offline report', projectId: conflict!.id })
  })

  it('cancels a stale delete and restores the cloud project', async () => {
    const db = await getDB()
    const scope = db.accountStorageScope('delete-conflict-user')
    db.setStorageScope(scope)
    await db.saveProject(
      'project-1',
      'Delete requested',
      {},
      {},
      {},
      { revision: 0 },
      scope,
    )
    await db.enqueueProjectDelete('project-1', 0, scope)
    const remote = createMockProject('project-1', 'Changed in cloud')
    remote.revision = 3
    api.getProject.mockResolvedValue(remote)
    const { ApiError } = await import('@/api/client')
    api.deleteProject.mockRejectedValueOnce(new ApiError('Conflict', 409))
    const { flushAllProjectSavesWithSync } = await import('./syncService')

    await expect(flushAllProjectSavesWithSync()).resolves.toEqual([
      { projectId: 'project-1', operation: 'delete' },
    ])

    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    expect(await db.loadProject('project-1', scope)).toMatchObject({
      name: 'Changed in cloud',
      revision: 3,
    })
  })
})
