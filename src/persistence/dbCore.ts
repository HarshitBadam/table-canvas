import { openDB, IDBPDatabase, type DBSchema } from 'idb'
import type { ProjectNode, Edge } from '@/types'
import type { Report } from '@/report/types'
import type { SerializedPatches } from './patchSerialization'

export type { SerializedPatches } from './patchSerialization'

export interface TableCanvasDB extends DBSchema {
  projects: {
    key: string
    value: {
      id: string
      name: string
      nodes: Record<string, ProjectNode>
      edges: Record<string, Edge>
      patches: Record<string, SerializedPatches>
      createdAt: string
      updatedAt: string
    }
    indexes: { 'by-updated': string }
  }
  files: {
    key: string
    value: {
      id: string
      name: string
      type: string
      data: ArrayBuffer
      createdAt: string
    }
  }
  reports: {
    key: string
    value: Report
    indexes: { 'by-updated': string }
  }
}

// Development reset: this database intentionally has no legacy upgrade path.
const DB_NAME = 'table-canvas-v2'
const DB_VERSION = 1

let dbInstance: IDBPDatabase<TableCanvasDB> | null = null

export async function getDB(): Promise<IDBPDatabase<TableCanvasDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<TableCanvasDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const projectStore = db.createObjectStore('projects', { keyPath: 'id' })
      projectStore.createIndex('by-updated', 'updatedAt')
      db.createObjectStore('files', { keyPath: 'id' })
      const reportsStore = db.createObjectStore('reports', { keyPath: 'id' })
      reportsStore.createIndex('by-updated', 'updatedAt')
    },
  })

  return dbInstance
}
