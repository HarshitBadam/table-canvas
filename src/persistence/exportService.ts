import JSZip from 'jszip'
import { exportProjectFile, loadAllReports, loadProject } from './db'
import { getTableData } from '@/engine/materializationService'
import type { ProjectNode } from '@/types'
import type { Report } from '@/report/types'
import {
  buildEmbeddedDataMap,
  collectEmbeddedTableIds,
  generateReportHtml,
  type EmbeddedDataMap,
} from './reportHtmlGenerator'
import { createWorkbook } from './exportWorkbook'

export interface ZipExportOptions {
  includeExcel?: boolean
  includeReportHtml?: boolean
  onProgress?: (message: string, percent: number) => void
}

async function buildReportData(
  report: Report,
  nodes: Record<string, ProjectNode>,
): Promise<EmbeddedDataMap> {
  if (!report.tiptapContent) return {}
  const limits = new Map<string, number>()
  for (const { tableId, rowLimit } of collectEmbeddedTableIds(report.tiptapContent)) {
    limits.set(tableId, Math.max(limits.get(tableId) ?? 0, rowLimit))
  }
  const entries = await Promise.all([...limits].map(async ([tableId, rowLimit]) => {
    try {
      const result = await getTableData(tableId, 0, rowLimit)
      if (result.error) {
        console.error(`[Export] Failed to read embedded table ${tableId}:`, result.error)
        return { tableId, rows: [] }
      }
      return { tableId, rows: result.rows }
    } catch (error) {
      console.error(`[Export] Failed to read embedded table ${tableId}:`, error)
      return { tableId, rows: [] }
    }
  }))
  return buildEmbeddedDataMap(entries, nodes)
}

async function addReports(
  zip: JSZip,
  reports: Awaited<ReturnType<typeof loadAllReports>>,
  nodes: Record<string, ProjectNode>,
): Promise<void> {
  const folder = zip.folder('reports')
  for (const report of Object.values(reports)) {
    const filename = `${report.name.replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 50)}.html`
    folder?.file(filename, generateReportHtml(report, await buildReportData(report, nodes)))
  }
}

export async function exportProjectAsZip(
  projectId: string,
  options: ZipExportOptions = {},
): Promise<Blob> {
  const zip = new JSZip()
  const { includeExcel = true, includeReportHtml = true, onProgress } = options

  onProgress?.('Preparing project data...', 10)
  zip.file('project.tablecanvas.json', await (await exportProjectFile(projectId)).text())

  const project = includeExcel || includeReportHtml ? await loadProject(projectId) : null
  if ((includeExcel || includeReportHtml) && !project) throw new Error('Project not found')

  if (includeExcel) {
    onProgress?.('Creating Excel workbook...', 30)
    const workbook = await createWorkbook(project!.nodes, onProgress)
    if (workbook) zip.file('data.xlsx', workbook)
  }

  if (includeReportHtml) {
    onProgress?.('Exporting reports...', 90)
    await addReports(zip, await loadAllReports(), project!.nodes)
  }

  onProgress?.('Compressing...', 98)
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  onProgress?.('Complete!', 100)
  return blob
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function exportAndDownloadProject(
  projectId: string,
  projectName: string,
  options?: ZipExportOptions,
): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const name = projectName.replace(/[^a-zA-Z0-9-_]/g, '_')
  downloadBlob(await exportProjectAsZip(projectId, options), `${name}_${date}.tablecanvas.zip`)
}
