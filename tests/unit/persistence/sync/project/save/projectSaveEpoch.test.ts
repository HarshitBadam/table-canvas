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

describe('auth epoch changes mid-flush', () => {
  it('acknowledges an accepted save in its original scope instead of retrying after relogin', async () => {
    const db = await getDB()
    const scopeModule = await import('@/persistence/storage/storageScope')
    const scope = db.accountStorageScope('epoch-flush-user')
    scopeModule.setStorageScope(scope)
    await db.saveProject('project-1', 'Quarterly', {}, {}, {}, { revision: 4 }, scope)
    await db.enqueueProjectSave('project-1', {
      name: 'Quarterly',
      nodes: {},
      edges: {},
      patches: {},
      reports: {},
    }, 4, scope)
    const sync = await import('@/persistence/sync/session/syncService')

    let resolveSave!: (project: ReturnType<typeof createMockProject>) => void
    api.updateProject.mockImplementationOnce(() => new Promise(resolve => {
      resolveSave = resolve
    }))

    const flush = sync.flushProjectSaveWithSync('project-1', scope)
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1))
    // A relogin into the same account bumps the auth epoch while the request is in flight.
    scopeModule.setStorageScope(scope)
    resolveSave({ ...createMockProject('project-1', 'Quarterly'), revision: 5 })
    await flush

    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    expect(await db.loadProject('project-1', scope)).toMatchObject({ revision: 5 })
  })

  it('never writes the acknowledgement into a different account scope', async () => {
    const db = await getDB()
    const scopeModule = await import('@/persistence/storage/storageScope')
    const scope = db.accountStorageScope('epoch-flush-original-user')
    const otherScope = db.accountStorageScope('epoch-flush-other-user')
    scopeModule.setStorageScope(scope)
    await db.saveProject('project-1', 'Quarterly', {}, {}, {}, { revision: 4 }, scope)
    await db.enqueueProjectSave('project-1', {
      name: 'Quarterly',
      nodes: {},
      edges: {},
      patches: {},
      reports: {},
    }, 4, scope)
    const sync = await import('@/persistence/sync/session/syncService')

    let resolveSave!: (project: ReturnType<typeof createMockProject>) => void
    api.updateProject.mockImplementationOnce(() => new Promise(resolve => {
      resolveSave = resolve
    }))

    const flush = sync.flushProjectSaveWithSync('project-1', scope)
    await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1))
    // Logging into a different account switches scope entirely while the request is in flight.
    scopeModule.setStorageScope(otherScope)
    resolveSave({ ...createMockProject('project-1', 'Quarterly'), revision: 5 })
    await flush

    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    expect(await db.loadProject('project-1', scope)).toMatchObject({ revision: 5 })
    expect(await db.loadProject('project-1', otherScope)).toBeNull()
  })
})
