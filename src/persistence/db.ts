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
// Project Export/Import (Full Export with Embedded Files)
// ============================================================================

/**
 * Export format version 2.0.0 - includes embedded file data
 */
const EXPORT_VERSION = '2.0.0'
const EXPORT_FORMAT_TYPE = 'tablecanvas-full'

/**
 * Embedded file structure in export
 */
interface ExportedFile {
  id: string
  name: string
  type: string
  data: string  // base64 encoded
  createdAt: string
}

/**
 * Full export structure
 */
interface TableCanvasExport {
  version: string
  formatType: string
  exportedAt: string
  project: {
    id: string
    name: string
    nodes: Record<string, ProjectNode>
    edges: Record<string, Edge>
    patches: Record<string, SerializedPatches>
  }
  files: Record<string, ExportedFile>
  reports?: Record<string, Report>
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Load a file record (with metadata) from IndexedDB
 */
async function loadFileRecord(id: string): Promise<{
  id: string
  name: string
  type: string
  data: ArrayBuffer
  createdAt: string
} | null> {
  const db = await getDB()
  const file = await db.get('files', id)
  return file ?? null
}

/**
 * Export project as a complete JSON file with embedded data
 * 
 * This creates a fully self-contained export that includes:
 * - All project metadata (nodes, edges, patches)
 * - All source file data (CSV/Excel) as base64
 * - All reports
 * - Canvas layout positions
 * 
 * The exported file can be imported on any account/device.
 */
export async function exportProjectFile(projectId: string): Promise<Blob> {
  const project = await loadProject(projectId)
  if (!project) throw new Error('Project not found')

  // Collect referenced file IDs from source tables
  const fileIds = new Set<string>()
  for (const node of Object.values(project.nodes)) {
    if (node.kind === 'source_table' && node.plan.fileRef) {
      fileIds.add(node.plan.fileRef)
    }
  }

  // Load all referenced files and convert to base64
  const files: Record<string, ExportedFile> = {}
  const missingFiles: string[] = []
  
  for (const fileId of fileIds) {
    const fileRecord = await loadFileRecord(fileId)
    if (fileRecord) {
      files[fileId] = {
        id: fileRecord.id,
        name: fileRecord.name,
        type: fileRecord.type,
        data: arrayBufferToBase64(fileRecord.data),
        createdAt: fileRecord.createdAt,
      }
    } else {
      missingFiles.push(fileId)
      console.warn(`[Export] File not found: ${fileId}`)
    }
  }

  // Load all reports
  const reports = await loadAllReports()

  // Build export data
  const exportData: TableCanvasExport = {
    version: EXPORT_VERSION,
    formatType: EXPORT_FORMAT_TYPE,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      nodes: project.nodes,
      edges: project.edges,
      patches: project.patches,
    },
    files,
    reports: Object.keys(reports).length > 0 ? reports : undefined,
  }

  // Log export summary
  console.log(`[Export] Project "${project.name}" exported:`, {
    nodes: Object.keys(project.nodes).length,
    edges: Object.keys(project.edges).length,
    files: Object.keys(files).length,
    reports: Object.keys(reports).length,
    missingFiles: missingFiles.length,
  })

  return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
}

/**
 * Parsed import data structure
 */
export interface ParsedImportData {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  filesRestored: number
  reportsRestored: number
}

/**
 * Parse and prepare a Table Canvas export file for import
 * 
 * This function:
 * 1. Validates the export format and version
 * 2. Restores all embedded files to IndexedDB with NEW IDs
 * 3. Remaps all fileRef references in source tables to new IDs
 * 4. Optionally restores reports
 * 5. Returns the prepared data (does NOT save the project - caller must do that)
 * 
 * @param file - The .tablecanvas.json file to import
 * @param options - Import options
 * @returns Parsed project data ready for saving
 */
export async function parseImportFile(
  file: File,
  options?: {
    importReports?: boolean  // Default: true
  }
): Promise<ParsedImportData> {
  const importReports = options?.importReports ?? true
  
  // Parse the file
  const text = await file.text()
  let data: TableCanvasExport
  
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid file: Unable to parse JSON')
  }

  // Validate format
  if (!data.version || !data.project) {
    throw new Error('Invalid project file format: missing version or project data')
  }

  // Check version compatibility
  const majorVersion = parseInt(data.version.split('.')[0], 10)
  if (majorVersion > 2) {
    throw new Error(`Unsupported export version: ${data.version}. Please update the application.`)
  }

  const project = data.project
  const exportedFiles = data.files || {}
  const exportedReports = data.reports || {}
  
  // Create file ID mapping (old ID -> new ID)
  const fileIdMap = new Map<string, string>()
  
  // Restore files with new IDs
  for (const [oldFileId, exportedFile] of Object.entries(exportedFiles)) {
    const newFileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    fileIdMap.set(oldFileId, newFileId)
    
    try {
      // Decode base64 to ArrayBuffer
      const fileData = base64ToArrayBuffer(exportedFile.data)
      
      // Save to IndexedDB with new ID
      await saveFile(
        newFileId,
        exportedFile.name,
        exportedFile.type,
        fileData
      )
      
      console.log(`[Import] Restored file: ${exportedFile.name} (${oldFileId} -> ${newFileId})`)
    } catch (err) {
      console.error(`[Import] Failed to restore file ${exportedFile.name}:`, err)
      throw new Error(`Failed to restore file "${exportedFile.name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Deep clone and remap nodes
  const remappedNodes: Record<string, ProjectNode> = {}
  
  for (const [nodeId, node] of Object.entries(project.nodes)) {
    // Clone the node
    const clonedNode = JSON.parse(JSON.stringify(node)) as ProjectNode
    
    // Remap fileRef for source tables
    if (clonedNode.kind === 'source_table' && clonedNode.plan.fileRef) {
      const oldFileRef = clonedNode.plan.fileRef
      const newFileRef = fileIdMap.get(oldFileRef)
      
      if (newFileRef) {
        clonedNode.plan.fileRef = newFileRef
        console.log(`[Import] Remapped fileRef: ${oldFileRef} -> ${newFileRef}`)
      } else {
        // File was missing from export - keep old ref but warn
        console.warn(`[Import] No mapping for fileRef: ${oldFileRef} (file was not in export)`)
      }
    }
    
    remappedNodes[nodeId] = clonedNode
  }

  // Convert patches back to proper format (with Sets)
  const patches: Record<string, Patches> = {}
  if (project.patches) {
    for (const [tableId, serialized] of Object.entries(project.patches as Record<string, SerializedPatches>)) {
      patches[tableId] = {
        cellPatches: serialized.cellPatches as Record<string, Record<string, import('@/lib/types').CellValue>>,
        deletedRows: new Set(serialized.deletedRows || []),
        insertedRows: (serialized.insertedRows || []) as import('@/lib/types').InsertedRow[],
        highlightedCells: new Set(serialized.highlightedCells || []),
      }
    }
  }

  // Import reports if requested
  let reportsRestored = 0
  if (importReports && Object.keys(exportedReports).length > 0) {
    const db = await getDB()
    const tx = db.transaction('reports', 'readwrite')
    
    for (const report of Object.values(exportedReports)) {
      // Generate new report ID to avoid conflicts
      const newReportId = `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const importedReport: Report = {
        ...report,
        id: newReportId,
        updatedAt: new Date().toISOString(),
      }
      await tx.store.put(importedReport)
      console.log(`[Import] Restored report: ${report.name}`)
      reportsRestored++
    }
    
    await tx.done
  }

  // Log import summary
  console.log(`[Import] Parsed project "${project.name}":`, {
    nodes: Object.keys(remappedNodes).length,
    edges: Object.keys(project.edges).length,
    filesRestored: fileIdMap.size,
    reportsRestored,
  })

  return {
    name: project.name,
    nodes: remappedNodes,
    edges: project.edges,
    patches,
    filesRestored: fileIdMap.size,
    reportsRestored,
  }
}

/**
 * Import project from a Table Canvas export file (legacy function for backward compatibility)
 * 
 * NOTE: This function saves locally with a non-server-compatible ID.
 * For proper server sync, use parseImportFile() + importProjectWithSync() instead.
 * 
 * @deprecated Use parseImportFile() + importProjectWithSync() for server compatibility
 */
export async function importProjectFile(
  file: File,
  options?: {
    importReports?: boolean
  }
): Promise<string> {
  const parsed = await parseImportFile(file, options)
  
  // Generate a local-only ID (won't work with server sync)
  const newProjectId = `local_${Date.now()}`
  
  // Save the project locally
  await saveProject(
    newProjectId,
    parsed.name,
    parsed.nodes,
    parsed.edges,
    parsed.patches
  )

  console.log(`[Import] Project saved locally as ${newProjectId}`)

  return newProjectId
}

/**
 * Legacy import support for v1.0.0 exports (metadata only, no files)
 * This function is kept for backward compatibility
 */
export async function importLegacyProjectFile(file: File): Promise<string> {
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

