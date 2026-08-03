import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

const DB_NAME = 'table-canvas-v2'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('getDB version recovery', () => {
  it('resets and reopens a database stuck at a newer version than expected', async () => {
    // Simulate a stale on-disk database left at a higher version than the app
    // currently requests, e.g. from an earlier local build that briefly used a
    // higher schema version before being reverted.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 99)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    vi.resetModules()
    const { getDB } = await import('./dbCore')
    const db = await getDB()

    expect(db.objectStoreNames.contains('projects')).toBe(true)
    expect(db.objectStoreNames.contains('files')).toBe(true)
    expect(db.objectStoreNames.contains('reports')).toBe(true)
    expect(db.objectStoreNames.contains('projectSync')).toBe(true)
    expect(db.objectStoreNames.contains('projectSyncBase')).toBe(true)
  })

  it('rethrows non-version errors instead of deleting the database', async () => {
    vi.resetModules()
    vi.doMock('idb', async () => {
      const actual = await vi.importActual<typeof import('idb')>('idb')
      return {
        ...actual,
        openDB: vi.fn().mockRejectedValue(new Error('boom')),
      }
    })

    const { getDB } = await import('./dbCore')
    await expect(getDB()).rejects.toThrow('boom')

    vi.doUnmock('idb')
  })
})
