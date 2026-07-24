import type { ProjectNode, Edge, Patches } from '@/types'
import type { Report } from '@/report/types'
import type { SerializedPatches } from './dbCore'
import { loadProject } from './projectStorage'
import { loadFileRecord } from './fileStorage'
import { loadReportsForProject } from './reportStorage'
import { generateId, readFileAsArrayBuffer } from '@/lib/utils'
import { detectCycles } from '@/engine/dependencyGraph'
import { getTransformSourceTableIds } from '@/engine/workflowGraph'
import { deleteFileWithSync, uploadFileWithSync } from './fileSync'
import { withoutTransientComputeState } from '@/state/transientProjectState'

const EXPORT_VERSION = '2.0.0'
const EXPORT_FORMAT_TYPE = 'tablecanvas-full'

interface ExportedFile {
  id: string
  name: string
  type: string
  data: string
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

function validateImportedWorkflow(nodes: Record<string, ProjectNode>): void {
  const edges: Record<string, Edge> = {}
  for (const node of Object.values(nodes)) {
    if (node.kind === 'derived_table') {
      const upstreamNodeIds = getTransformSourceTableIds(node.plan.transformDef)
      const missingUpstream = upstreamNodeIds.find(id => !nodes[id])
      if (missingUpstream) {
        throw new Error(`Invalid workflow: "${node.name}" references a missing upstream table`)
      }
      for (const sourceId of upstreamNodeIds) {
        const edgeId = generateId()
        edges[edgeId] = {
          id: edgeId,
          fromNodeId: sourceId,
          toNodeId: node.id,
          transformType: node.plan.transformDef.type,
        }
      }
    } else if (node.kind === 'chart') {
      const source = nodes[node.plan.sourceTableId]
      if (!source || source.kind === 'chart') {
        throw new Error(`Invalid workflow: chart "${node.name}" references a missing table`)
      }
      const edgeId = generateId()
      edges[edgeId] = {
        id: edgeId,
        fromNodeId: source.id,
        toNodeId: node.id,
        transformType: 'reference',
      }
    }
  }
  if (detectCycles(nodes, edges).length > 0) {
    throw new Error('Invalid workflow: the imported graph contains a circular dependency')
  }
}

async function readImportText(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
    const { default: JSZip } = await import('jszip')
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
    try {
      zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file))
    } catch {
      throw new Error('Invalid project archive: unable to open ZIP file')
    }
    const projectFile = zip.file('project.tablecanvas.json')
      ?? Object.values(zip.files).find(
        (entry) => !entry.dir && /\.tablecanvas\.json$/i.test(entry.name),
      )
    if (!projectFile) {
      throw new Error('Invalid project archive: project.tablecanvas.json is missing')
    }
    return projectFile.async('string')
  }
  return file.text()
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
  if (missingFiles.length > 0) {
    throw new Error(
      `Cannot export this project because ${missingFiles.length} source file${
        missingFiles.length === 1 ? ' is' : 's are'
      } unavailable. Re-import the affected table data and try again.`,
    )
  }

  const reports = await loadReportsForProject(projectId)

  const exportData: TableCanvasExport = {
    version: EXPORT_VERSION,
    formatType: EXPORT_FORMAT_TYPE,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      nodes: withoutTransientComputeState(project.nodes),
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
  reports: Report[]
}

class ImportFileRollbackError extends Error {
  constructor(
    message: string,
    public readonly failures: unknown[],
  ) {
    super(message)
    this.name = 'ImportFileRollbackError'
  }
}

export async function parseImportFile(
  file: File,
  options?: {
    importReports?: boolean
  }
): Promise<ParsedImportData> {
  const importReports = options?.importReports ?? true

  const text = await readImportText(file)
  let data: TableCanvasExport

  try {
    data = JSON.parse(text)
  } catch (error) {
    console.error('[exportImport] Failed to parse import file as JSON:', error)
    throw new Error('Invalid file: Unable to parse JSON')
  }

  if (
    !data.version
    || !data.project
    || !data.project.nodes
    || !data.project.edges
    || !data.project.patches
  ) {
    throw new Error('Invalid project file format: missing version or project data')
  }
  if (data.formatType && data.formatType !== EXPORT_FORMAT_TYPE) {
    throw new Error(`Unsupported project format: ${data.formatType}`)
  }

  const majorVersion = parseInt(data.version.split('.')[0], 10)
  if (majorVersion > 2) {
    throw new Error(`Unsupported export version: ${data.version}. Please update the application.`)
  }

  const project = data.project
  const exportedFiles = data.files || {}
  const exportedReports = data.reports || {}
  const missingFileNames = Object.values(project.nodes)
    .filter((node) => node.kind === 'source_table' && Boolean(node.plan.fileRef))
    .filter((node) => !exportedFiles[node.kind === 'source_table' ? node.plan.fileRef : ''])
    .map((node) => node.name)
  if (missingFileNames.length > 0) {
    throw new Error(
      `Project archive is incomplete. Missing source data for: ${missingFileNames.join(', ')}`,
    )
  }
  validateImportedWorkflow(project.nodes)

  const fileIdMap = new Map<string, string>()
  const createdFileIds: string[] = []

  for (const [oldFileId, exportedFile] of Object.entries(exportedFiles)) {
    try {
      const fileData = base64ToArrayBuffer(exportedFile.data)
      const restored = await uploadFileWithSync(
        new File([fileData], exportedFile.name, { type: exportedFile.type }),
      )
      fileIdMap.set(oldFileId, restored.id)
      createdFileIds.push(restored.id)

      console.log(`[Import] Restored file: ${exportedFile.name} (${oldFileId} -> ${restored.id})`)
    } catch (err) {
      console.error(`[Import] Failed to restore file ${exportedFile.name}:`, err)
      const cleanupResults = await Promise.allSettled(
        createdFileIds.map(fileId => deleteFileWithSync(fileId, { strictRemote: true })),
      )
      const cleanupErrors = cleanupResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason)
      const importError = new Error(
        `Failed to restore file "${exportedFile.name}": ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      )
      if (cleanupErrors.length > 0) {
        throw new ImportFileRollbackError(
          'Import failed and newly created files could not be fully cleaned up.',
          [importError, ...cleanupErrors],
        )
      }
      throw importError
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
      }
    }

    remappedNodes[nodeId] = clonedNode
  }
  const normalizedNodes = withoutTransientComputeState(remappedNodes)

  const normalizedEdges: Record<string, Edge> = {}
  for (const node of Object.values(normalizedNodes)) {
    if (node.kind === 'derived_table') {
      const upstreamNodeIds = getTransformSourceTableIds(node.plan.transformDef)
      const missingUpstream = upstreamNodeIds.find((id) => !normalizedNodes[id])
      if (missingUpstream) {
        throw new Error(`Invalid workflow: "${node.name}" references a missing upstream table`)
      }
      node.plan.upstreamNodeIds = upstreamNodeIds
      for (const sourceId of upstreamNodeIds) {
        const edgeId = generateId()
        normalizedEdges[edgeId] = {
          id: edgeId,
          fromNodeId: sourceId,
          toNodeId: node.id,
          transformType: node.plan.transformDef.type,
        }
      }
    } else if (node.kind === 'chart') {
      const source = normalizedNodes[node.plan.sourceTableId]
      if (!source || source.kind === 'chart') {
        throw new Error(`Invalid workflow: chart "${node.name}" references a missing table`)
      }
      const edgeId = generateId()
      normalizedEdges[edgeId] = {
        id: edgeId,
        fromNodeId: source.id,
        toNodeId: node.id,
        transformType: 'reference',
      }
    }
  }
  if (detectCycles(normalizedNodes, normalizedEdges).length > 0) {
    throw new Error('Invalid workflow: the imported graph contains a circular dependency')
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
  const reports: Report[] = []
  if (importReports && Object.keys(exportedReports).length > 0) {
    for (const report of Object.values(exportedReports)) {
      const newReportId = `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const importedReport: Report = {
        ...report,
        id: newReportId,
        projectId: undefined,
        updatedAt: new Date().toISOString(),
      }
      reports.push(importedReport)
      console.log(`[Import] Restored report: ${report.name}`)
      reportsRestored++
    }
  }

  console.log(`[Import] Parsed project "${project.name}":`, {
    nodes: Object.keys(normalizedNodes).length,
    edges: Object.keys(project.edges).length,
    filesRestored: fileIdMap.size,
    reportsRestored,
  })

  return {
    name: project.name,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    patches,
    filesRestored: fileIdMap.size,
    reportsRestored,
    reports,
  }
}

