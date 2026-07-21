import { openDB, IDBPDatabase, type DBSchema } from 'idb'
import type { ProjectNode, Edge } from '@/types'
import type { Report } from '@/report/types'
import type { SerializedPatches } from './patchSerialization'

export type { SerializedPatches } from './patchSerialization'

export interface ScopedRecord {
  /** IndexedDB key. Never expose this value outside the persistence layer. */
  id: string
  /** Missing only on records written by the legacy, unscoped schema. */
  entityId?: string
  /** Missing on quarantined records written by the legacy, unscoped schema. */
  ownerId?: string
}

export interface ProjectSyncOperation extends ScopedRecord {
  projectId: string
  generation: number
  expectedRevision: number
  operation: 'save' | 'delete'
  updatedAt: string
  payload?: {
    name: string
    nodes: Record<string, ProjectNode>
    edges: Record<string, Edge>
    patches: Record<string, SerializedPatches>
    reports: Record<string, Report>
  }
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
}

const DB_NAME = 'table-canvas-v2'
const DB_VERSION = 2

let dbInstance: IDBPDatabase<TableCanvasDB> | null = null

export async function getDB(): Promise<IDBPDatabase<TableCanvasDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<TableCanvasDB>(DB_NAME, DB_VERSION, {
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
    },
  })

  return dbInstance
}
