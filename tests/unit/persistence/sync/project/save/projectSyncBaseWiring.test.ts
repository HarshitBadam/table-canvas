import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDB } from '@/persistence/storage/local-db/dbTestSupport'
import { createMockProject } from '@/persistence/sync/session/syncServiceTestSupport'

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

async function setupScope(scopeName: string) {
  const db = await getDB()
  const scope = db.accountStorageScope(scopeName)
  db.setStorageScope(scope)
  return {
    db,
    scope,
    syncBase: await import('@/persistence/sync/project/save/projectSyncBase'),
    sync: await import('@/persistence/sync/session/syncService'),
  }
}

function remoteProject(name: string, revision: number) {
  const project = createMockProject('project-1', name)
  return {
    ...project,
    revision,
    nodes: {
      node_1: {
        id: 'node_1',
        kind: 'source_table' as const,
        name: 'Sales',
        ui: { position: { x: 0, y: 0 } },
        plan: {
          fileRef: 'file_1',
          fileName: 'sales.csv',
          fileType: 'csv' as const,
          inferredSchemaVersion: 1,
        },
        cacheInfo: { isDirty: true },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    },
    reports: {
      report_1: {
        id: 'report_1',
        projectId: 'project-1',
        name: 'Cloud report',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    },
  }
}

describe('merge base capture', () => {
  it('records the server copy when a project is loaded remotely', async () => {
    const { scope, syncBase, sync } = await setupScope('remote-load-user')
    api.getProject.mockResolvedValue(remoteProject('Cloud project', 7))

    await sync.loadProjectWithSync('project-1')

    const base = await syncBase.getProjectSyncBase('project-1', scope)
    expect(base).toMatchObject({
      projectId: 'project-1',
      revision: 7,
      snapshot: {
        name: 'Cloud project',
        reports: { report_1: { name: 'Cloud report' } },
      },
    })
    expect(base?.snapshot.nodes.node_1).not.toHaveProperty('cacheInfo')
  })

  it('records the server copy when a project is created remotely', async () => {
    const { scope, syncBase, sync } = await setupScope('remote-create-user')
    api.createProject.mockResolvedValue(remoteProject('New project', 1))

    const created = await sync.createProjectWithSync('New project')

    expect(created.revision).toBe(1)
    expect(await syncBase.getProjectSyncBase('project-1', scope)).toMatchObject({
      revision: 1,
      snapshot: { name: 'New project' },
    })
  })

  it('discards the base when the project is deleted in the cloud', async () => {
    const { db, scope, syncBase, sync } = await setupScope('remote-delete-user')
    await db.saveProject('project-1', 'Cloud project', {}, {}, {}, { revision: 7 })
    await syncBase.putProjectSyncBase('project-1', 7, {
      name: 'Cloud project',
      nodes: {},
      edges: {},
      patches: {},
      reports: {},
    }, scope)
    api.getProject.mockResolvedValue(remoteProject('Cloud project', 7))
    api.deleteProject.mockResolvedValue(undefined)

    await sync.deleteProjectWithSync('project-1')

    expect(api.deleteProject).toHaveBeenCalledWith('project-1', 7)
    expect(await syncBase.getProjectSyncBase('project-1', scope)).toBeNull()
  })

  it('discards the base when a local-only project is deleted', async () => {
    const { db, scope, syncBase, sync } = await setupScope('local-delete-user')
    await db.saveProject('local_1', 'Offline project', {}, {}, {})
    await syncBase.putProjectSyncBase('local_1', 0, {
      name: 'Offline project',
      nodes: {},
      edges: {},
      patches: {},
      reports: {},
    }, scope)

    await sync.deleteProjectWithSync('local_1')

    expect(api.deleteProject).not.toHaveBeenCalled()
    expect(await syncBase.getProjectSyncBase('local_1', scope)).toBeNull()
  })
})
