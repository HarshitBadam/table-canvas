import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDB } from '@/persistence/storage/local-db/dbTestSupport'
import { createMockProject } from '@/persistence/sync/session/syncServiceTestSupport'
import { FakeLockManager } from '@test/fakeTabEnvironment'

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

describe('queue flush locking', () => {
  it.each([
    ['Web Locks', new FakeLockManager()],
    ['tab-local fallback', undefined],
  ])('does not block unrelated projects with %s', async (_label, lockManager) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks')
    Object.defineProperty(navigator, 'locks', {
      value: lockManager,
      configurable: true,
    })
    try {
      const db = await getDB()
      const scope = db.accountStorageScope('scope-lock-user')
      db.setStorageScope(scope)
      for (const projectId of ['project-1', 'project-2']) {
        await db.saveProject(projectId, projectId, {}, {}, {}, { revision: 0 }, scope)
        await db.enqueueProjectSave(projectId, {
          name: projectId,
          nodes: {},
          edges: {},
          patches: {},
          reports: {},
        }, 0, scope)
      }
      let active = 0
      let maximumActive = 0
      api.updateProject.mockImplementation(async (
        id: string,
        data: { name: string; expectedRevision: number },
      ) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return {
          ...createMockProject(id, data.name),
          revision: data.expectedRevision + 1,
        }
      })
      const sync = await import('@/persistence/sync/session/syncService')

      await Promise.all([
        sync.flushProjectSaveWithSync('project-1', scope),
        sync.flushProjectSaveWithSync('project-2', scope),
      ])

      expect(maximumActive).toBe(2)
    } finally {
      if (descriptor) {
        Object.defineProperty(navigator, 'locks', descriptor)
      } else {
        Reflect.deleteProperty(navigator, 'locks')
      }
    }
  })

  it('re-reads the queue after a cross-tab Web Lock wait', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks')
    Object.defineProperty(navigator, 'locks', {
      value: new FakeLockManager(),
      configurable: true,
    })
    try {
      const db = await getDB()
      const scope = db.accountStorageScope('cross-tab-flush-user')
      db.setStorageScope(scope)
      await db.saveProject('project-1', 'Queued once', {}, {}, {}, { revision: 0 }, scope)
      await db.enqueueProjectSave('project-1', {
        name: 'Queued once',
        nodes: {},
        edges: {},
        patches: {},
        reports: {},
      }, 0, scope)

      vi.resetModules()
      const firstScope = await import('@/persistence/storage/storageScope')
      firstScope.setStorageScope(scope)
      const firstTab = await import('@/persistence/sync/session/syncService')
      vi.resetModules()
      const secondScope = await import('@/persistence/storage/storageScope')
      secondScope.setStorageScope(scope)
      const secondTab = await import('@/persistence/sync/session/syncService')

      let resolveSave!: (project: ReturnType<typeof createMockProject>) => void
      api.updateProject.mockImplementationOnce(() => new Promise(resolve => {
        resolveSave = resolve
      }))
      const firstFlush = firstTab.flushProjectSaveWithSync('project-1', scope)
      await vi.waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1))
      const secondFlush = secondTab.flushProjectSaveWithSync('project-1', scope)
      await Promise.resolve()
      expect(api.updateProject).toHaveBeenCalledTimes(1)

      resolveSave({ ...createMockProject('project-1', 'Queued once'), revision: 1 })
      await Promise.all([firstFlush, secondFlush])

      expect(api.updateProject).toHaveBeenCalledTimes(1)
      expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    } finally {
      if (descriptor) {
        Object.defineProperty(navigator, 'locks', descriptor)
      } else {
        Reflect.deleteProperty(navigator, 'locks')
      }
    }
  })
})
