import type { ProjectNode, Edge, Patches } from '@/types'
import type { Report } from '@/report/types'
import { getDB, type SerializedPatches } from './dbCore'
import { saveProject, loadProject } from './projectStorage'
import { saveFile, loadFileRecord } from './fileStorage'
import { loadAllReports } from './reportStorage'

const EXPORT_VERSION = '2.0.0'
const EXPORT_FORMAT_TYPE = 'tablecanvas-full'

interface ExportedFile {
  id: string
  name: string
  type: string
  data: string  // base64 encoded
  createdAt: string
}

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function exportProjectFile(projectId: string): Promise<Blob> {
  const project = await loadProject(projectId)
  if (!project) throw new Error('Project not found')

  const fileIds = new Set<string>()
  for (const node of Object.values(project.nodes)) {
    if (node.kind === 'source_table' && node.plan.fileRef) {
      fileIds.add(node.plan.fileRef)
    }
  }

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

  const reports = await loadAllReports()

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

  console.log(`[Export] Project "${project.name}" exported:`, {
    nodes: Object.keys(project.nodes).length,
    edges: Object.keys(project.edges).length,
    files: Object.keys(files).length,
    reports: Object.keys(reports).length,
    missingFiles: missingFiles.length,
  })

  return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
}

export interface ParsedImportData {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  filesRestored: number
  reportsRestored: number
}

/**
 * Validates the export format and version, restores embedded files to IndexedDB
 * with new IDs, remaps all fileRef references, and optionally restores reports.
 * Does NOT save the project — caller must do that.
 */
export async function parseImportFile(
  file: File,
  options?: {
    importReports?: boolean
  }
): Promise<ParsedImportData> {
  const importReports = options?.importReports ?? true

  const text = await file.text()
  let data: TableCanvasExport

  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid file: Unable to parse JSON')
  }

  if (!data.version || !data.project) {
    throw new Error('Invalid project file format: missing version or project data')
  }

  const majorVersion = parseInt(data.version.split('.')[0], 10)
  if (majorVersion > 2) {
    throw new Error(`Unsupported export version: ${data.version}. Please update the application.`)
  }

  const project = data.project
  const exportedFiles = data.files || {}
  const exportedReports = data.reports || {}

  const fileIdMap = new Map<string, string>()

  for (const [oldFileId, exportedFile] of Object.entries(exportedFiles)) {
    const newFileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    fileIdMap.set(oldFileId, newFileId)

    try {
      const fileData = base64ToArrayBuffer(exportedFile.data)

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

  const remappedNodes: Record<string, ProjectNode> = {}

  for (const [nodeId, node] of Object.entries(project.nodes)) {
    const clonedNode = JSON.parse(JSON.stringify(node)) as ProjectNode

    if (clonedNode.kind === 'source_table' && clonedNode.plan.fileRef) {
      const oldFileRef = clonedNode.plan.fileRef
      const newFileRef = fileIdMap.get(oldFileRef)

      if (newFileRef) {
        clonedNode.plan.fileRef = newFileRef
        console.log(`[Import] Remapped fileRef: ${oldFileRef} -> ${newFileRef}`)
      } else {
        console.warn(`[Import] No mapping for fileRef: ${oldFileRef} (file was not in export)`)
      }
    }

    remappedNodes[nodeId] = clonedNode
  }

  const patches: Record<string, Patches> = {}
  if (project.patches) {
    for (const [tableId, serialized] of Object.entries(project.patches as Record<string, SerializedPatches>)) {
      patches[tableId] = {
        cellPatches: serialized.cellPatches as Record<string, Record<string, import('@/types').CellValue>>,
        deletedRows: new Set(serialized.deletedRows || []),
        insertedRows: (serialized.insertedRows || []) as import('@/types').InsertedRow[],
        highlightedCells: new Set(serialized.highlightedCells || []),
      }
    }
  }

  let reportsRestored = 0
  if (importReports && Object.keys(exportedReports).length > 0) {
    const db = await getDB()
    const tx = db.transaction('reports', 'readwrite')

    for (const report of Object.values(exportedReports)) {
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
 * @deprecated Use parseImportFile() + importProjectWithSync() for server compatibility
 */
export async function importProjectFile(
  file: File,
  options?: {
    importReports?: boolean
  }
): Promise<string> {
  const parsed = await parseImportFile(file, options)

  const newProjectId = `local_${Date.now()}`

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

export async function importLegacyProjectFile(file: File): Promise<string> {
  const text = await file.text()
  const data = JSON.parse(text)

  if (!data.version || !data.project) {
    throw new Error('Invalid project file format')
  }

  const newId = `project_${Date.now()}`
  const project = data.project

  const patches: Record<string, Patches> = {}
  if (project.patches) {
    for (const [tableId, serialized] of Object.entries(project.patches as Record<string, SerializedPatches>)) {
      patches[tableId] = {
        cellPatches: serialized.cellPatches as Record<string, Record<string, import('@/types').CellValue>>,
        deletedRows: new Set(serialized.deletedRows),
        insertedRows: serialized.insertedRows as import('@/types').InsertedRow[],
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
