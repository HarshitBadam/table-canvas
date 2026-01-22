/**
 * IndexedDB Persistence Layer
 * Stores project data, file blobs, cached results, and reports
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { ProjectNode, Edge, Patches } from '@/lib/types'
import type { Report } from '@/report/types'

// Database schema
interface TableCanvasDB extends DBSchema {
  projects: {
    key: string
    value: {
      id: string
      name: string
      nodes: Record<string, ProjectNode>
      edges: Record<string, Edge>
      patches: Record<string, Patches>
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
  cache: {
    key: [string, string]  // Compound key: [tableId, type]
    value: {
      tableId: string
      type: 'profile' | 'slice' | 'aggregation'
      data: unknown
      computedAt: string
    }
    indexes: { 'by-table': string }
  }
  reports: {
    key: string
    value: Report
    indexes: { 'by-updated': string }
  }
}

const DB_NAME = 'table-canvas'
const DB_VERSION = 2

let dbInstance: IDBPDatabase<TableCanvasDB> | null = null

/**
 * Get or create database instance
 */
async function getDB(): Promise<IDBPDatabase<TableCanvasDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<TableCanvasDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Version 1: Initial schema
      if (oldVersion < 1) {
        // Projects store
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' })
        projectStore.createIndex('by-updated', 'updatedAt')

        // Files store (for imported data files)
        db.createObjectStore('files', { keyPath: 'id' })

        // Cache store (for profiling, slices, etc.)
        const cacheStore = db.createObjectStore('cache', { keyPath: ['tableId', 'type'] })
        cacheStore.createIndex('by-table', 'tableId')
      }

      // Version 2: Add reports store
      if (oldVersion < 2) {
        const reportsStore = db.createObjectStore('reports', { keyPath: 'id' })
        reportsStore.createIndex('by-updated', 'updatedAt')
      }
    },
  })

  return dbInstance
}

// ============================================================================
// Project Operations
// ============================================================================

export interface StoredProject {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, SerializedPatches>
  createdAt: string
  updatedAt: string
}

// Serialized patches with Set converted to Array
interface SerializedPatches {
  cellPatches: Record<string, Record<string, unknown>>
  deletedRows: string[]
  insertedRows: Array<{ rowId: string; values: Record<string, unknown>; insertedAt: number }>
  highlightedCells: string[]
}

/**
 * Save a project to IndexedDB
 */
export async function saveProject(
  id: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>
): Promise<void> {
  const db = await getDB()
  
  // Serialize patches (convert Sets to Arrays)
  const serializedPatches: Record<string, SerializedPatches> = {}
  for (const [tableId, tablePatch] of Object.entries(patches)) {
    serializedPatches[tableId] = {
      cellPatches: tablePatch.cellPatches,
      deletedRows: Array.from(tablePatch.deletedRows),
      insertedRows: tablePatch.insertedRows,
      highlightedCells: Array.from(tablePatch.highlightedCells || []),
    }
  }

  const project = {
    id,
    name,
    nodes,
    edges,
    patches: serializedPatches,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.put('projects', project as unknown as TableCanvasDB['projects']['value'])
}

/**
 * Load a project from IndexedDB
 */
export async function loadProject(id: string): Promise<StoredProject | null> {
  const db = await getDB()
  const project = await db.get('projects', id)
  
  if (!project) return null

  return project as unknown as StoredProject
}

/**
 * List all projects
 */
export async function listProjects(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const db = await getDB()
  const projects = await db.getAllFromIndex('projects', 'by-updated')
  
  return projects.map(p => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
  })).reverse() // Most recent first
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('projects', id)
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Save a file blob
 */
export async function saveFile(id: string, name: string, type: string, data: ArrayBuffer): Promise<void> {
  const db = await getDB()
  
  await db.put('files', {
    id,
    name,
    type,
    data,
    createdAt: new Date().toISOString(),
  })
}

/**
 * Load a file blob
 */
export async function loadFile(id: string): Promise<ArrayBuffer | null> {
  const db = await getDB()
  const file = await db.get('files', id)
  return file?.data ?? null
}

/**
 * Delete a file
 */
export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('files', id)
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Save cached data
 */
export async function saveCache(
  tableId: string,
  type: 'profile' | 'slice' | 'aggregation',
  data: unknown
): Promise<void> {
  const db = await getDB()
  
  await db.put('cache', {
    tableId,
    type,
    data,
    computedAt: new Date().toISOString(),
  })
}

/**
 * Load cached data
 */
export async function loadCache(
  tableId: string,
  type: 'profile' | 'slice' | 'aggregation'
): Promise<unknown | null> {
  const db = await getDB()
  const cached = await db.get('cache', [tableId, type])
  return cached?.data ?? null
}

/**
 * Clear cache for a table
 */
export async function clearTableCache(tableId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('cache', 'readwrite')
  const index = tx.store.index('by-table')
  
  const keysToDelete = await index.getAllKeys(tableId)
  for (const key of keysToDelete) {
    await tx.store.delete(key)
  }
  
  await tx.done
}

// ============================================================================
// Project Export/Import
// ============================================================================

/**
 * Export project as JSON file
 */
export async function exportProjectFile(projectId: string): Promise<Blob> {
  const project = await loadProject(projectId)
  if (!project) throw new Error('Project not found')

  // Collect referenced file IDs
  const fileIds = new Set<string>()
  for (const node of Object.values(project.nodes)) {
    if (node.kind === 'source_table' && node.plan.fileRef) {
      fileIds.add(node.plan.fileRef)
    }
  }

  // Note: We're not including file blobs in the export for now
  // In production, you might want to include them or offer re-import

  const exportData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      nodes: project.nodes,
      edges: project.edges,
      patches: project.patches,
    },
    fileRefs: Array.from(fileIds), // List of required files for re-import
  }

  return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
}

/**
 * Import project from JSON file
 */
export async function importProjectFile(file: File): Promise<string> {
  const text = await file.text()
  const data = JSON.parse(text)

  if (!data.version || !data.project) {
    throw new Error('Invalid project file format')
  }

  // Generate new ID to avoid conflicts
  const newId = `project_${Date.now()}`
  const project = data.project

  // Convert patches back to proper format
  const patches: Record<string, Patches> = {}
  if (project.patches) {
    for (const [tableId, serialized] of Object.entries(project.patches as Record<string, SerializedPatches>)) {
      patches[tableId] = {
        cellPatches: serialized.cellPatches as Record<string, Record<string, import('@/lib/types').CellValue>>,
        deletedRows: new Set(serialized.deletedRows),
        insertedRows: serialized.insertedRows as import('@/lib/types').InsertedRow[],
        highlightedCells: new Set(serialized.highlightedCells || []),
      }
    }
  }

  await saveProject(
    newId,
    project.name,
    project.nodes,
    project.edges,
    patches
  )

  return newId
}

// ============================================================================
// Report Operations
// ============================================================================

/**
 * Save a report to IndexedDB
 */
export async function saveReport(report: Report): Promise<void> {
  const db = await getDB()
  await db.put('reports', report)
}

/**
 * Load a report from IndexedDB
 */
export async function loadReport(id: string): Promise<Report | null> {
  const db = await getDB()
  const report = await db.get('reports', id)
  return report ?? null
}

/**
 * Load all reports from IndexedDB
 */
export async function loadAllReports(): Promise<Record<string, Report>> {
  const db = await getDB()
  const reports = await db.getAll('reports')
  const result: Record<string, Report> = {}
  for (const report of reports) {
    result[report.id] = report
  }
  return result
}

/**
 * List all reports (summary only)
 */
export async function listReports(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const db = await getDB()
  const reports = await db.getAllFromIndex('reports', 'by-updated')
  
  return reports.map(r => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updatedAt,
  })).reverse() // Most recent first
}

/**
 * Delete a report
 */
export async function deleteReport(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('reports', id)
}

/**
 * Save all reports to IndexedDB (bulk save)
 */
export async function saveAllReports(reports: Record<string, Report>): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('reports', 'readwrite')
  
  for (const report of Object.values(reports)) {
    await tx.store.put(report)
  }
  
  await tx.done
}

