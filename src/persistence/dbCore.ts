import { openDB, deleteDB, IDBPDatabase, type DBSchema } from 'idb'
import type { ProjectNode, Edge } from '@/types'
import type { Report } from '@/report/types'
import type { SerializedPatches } from './patchSerialization'

export type { SerializedPatches } from './patchSerialization'

interface ScopedRecord {
  /** IndexedDB key. Never expose this value outside the persistence layer. */
  id: string
  /** Missing only on records written by the legacy, unscoped schema. */
  entityId?: string
  /** Missing on quarantined records written by the legacy, unscoped schema. */
  ownerId?: string
}

export interface ProjectSnapshot {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, SerializedPatches>
  reports: Record<string, Report>
}

export interface ProjectSyncOperation extends ScopedRecord {
  projectId: string
  generation: number
  expectedRevision: number
  operation: 'save' | 'delete'
  updatedAt: string
  payload?: ProjectSnapshot
}

/** Last snapshot known to match `revision` on the server, for three-way merges. */
export interface ProjectSyncBaseRecord extends ScopedRecord {
  projectId: string
  revision: number
  capturedAt: string
  snapshot: ProjectSnapshot
}

export interface TableCanvasDB extends DBSchema {
  projects: {
    key: string
    value: ScopedRecord & {
      name: string
      nodes: Record<string, ProjectNode>
      edges: Record<string, Edge>
      patches: Record<string, SerializedPatches>
      createdAt: string
      updatedAt: string
      revision?: number
    }
    indexes: {
      'by-updated': string
      'by-owner': string
    }
  }
  files: {
    key: string
    value: ScopedRecord & {
      name: string
      type: string
      data: ArrayBuffer
      createdAt: string
    }
    indexes: { 'by-owner': string }
  }
  reports: {
    key: string
    value: ScopedRecord & Omit<Report, 'id'>
    indexes: {
      'by-updated': string
      'by-owner': string
      'by-owner-project': [string, string]
    }
  }
  projectSync: {
    key: string
    value: ProjectSyncOperation
    indexes: { 'by-owner': string }
  }
  projectSyncBase: {
    key: string
    value: ProjectSyncBaseRecord
    indexes: { 'by-owner': string }
  }
}

const DB_NAME = 'table-canvas-v2'
const DB_VERSION = 3

let dbInstance: IDBPDatabase<TableCanvasDB> | null = null
let dbOpenPromise: Promise<IDBPDatabase<TableCanvasDB>> | null = null

/** Long enough for a normal open/upgrade; short enough to fail fast if another
 *  tab is holding a connection open and never releases it. */
const DB_OPERATION_TIMEOUT_MS = 8_000

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), DB_OPERATION_TIMEOUT_MS)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function openTableCanvasDB(): Promise<IDBPDatabase<TableCanvasDB>> {
  return openDB<TableCanvasDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' })
        projectStore.createIndex('by-updated', 'updatedAt')
        db.createObjectStore('files', { keyPath: 'id' })
        const reportsStore = db.createObjectStore('reports', { keyPath: 'id' })
        reportsStore.createIndex('by-updated', 'updatedAt')
      }
      if (oldVersion < 2) {
        const projectStore = transaction.objectStore('projects')
        const fileStore = transaction.objectStore('files')
        const reportsStore = transaction.objectStore('reports')
        projectStore.createIndex('by-owner', 'ownerId')
        fileStore.createIndex('by-owner', 'ownerId')
        reportsStore.createIndex('by-owner', 'ownerId')
        reportsStore.createIndex('by-owner-project', ['ownerId', 'projectId'])
        const syncStore = db.createObjectStore('projectSync', { keyPath: 'id' })
        syncStore.createIndex('by-owner', 'ownerId')
      }
      if (oldVersion < 3) {
        const baseStore = db.createObjectStore('projectSyncBase', { keyPath: 'id' })
        baseStore.createIndex('by-owner', 'ownerId')
      }
    },
    // Another tab wants to upgrade or delete this database. Release our
    // connection immediately instead of silently blocking that tab (and, via
    // deleteDB's own blocking wait, ourselves) forever.
    blocking() {
      dbInstance?.close()
      dbInstance = null
    },
    blocked(currentVersion, blockedVersion) {
      console.warn(
        `[db] Open blocked by another tab holding version ${currentVersion} `
        + `(wanted ${blockedVersion}). Waiting for it to release the connection.`,
      )
    },
  })
}

async function resetTableCanvasDB(): Promise<void> {
  dbInstance?.close()
  dbInstance = null
  await withTimeout(
    deleteDB(DB_NAME, {
      blocked() {
        console.warn('[db] Reset blocked by another open tab; waiting for it to close.')
      },
    }),
    'Local database reset timed out. Close other Table Canvas tabs and try again.',
  )
}

async function openWithRecovery(): Promise<IDBPDatabase<TableCanvasDB>> {
  try {
    return await withTimeout(
      openTableCanvasDB(),
      'Local database did not open in time. Close other Table Canvas tabs and try again.',
    )
  } catch (error) {
    // The browser can hold an on-disk copy of this database at a version newer
    // than DB_VERSION (e.g. left over from a local build that briefly used a
    // higher schema version, or a stale WebKit version record). That makes
    // every open attempt fail forever with a VersionError. Recover by
    // dropping the stale database instead of leaving the app permanently
    // stuck before it can even reach the login screen.
    if (error instanceof DOMException && error.name === 'VersionError') {
      console.warn('[db] Local database version is newer than expected; resetting it.', error)
      await resetTableCanvasDB()
      return withTimeout(
        openTableCanvasDB(),
        'Local database did not open in time after reset. Close other Table Canvas tabs and try again.',
      )
    }
    throw error
  }
}

export async function getDB(): Promise<IDBPDatabase<TableCanvasDB>> {
  if (dbInstance) return dbInstance
  if (!dbOpenPromise) {
    dbOpenPromise = openWithRecovery()
      .then(db => {
        dbInstance = db
        return db
      })
      .catch(error => {
        dbOpenPromise = null
        throw error
      })
  }
  return dbOpenPromise
}
