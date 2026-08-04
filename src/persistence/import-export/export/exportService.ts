import type JSZipInstance from 'jszip'
import { exportProjectFile, loadReportsForProject, loadProject } from '../../storage/local-db/db'
import type { ProjectNode } from '@/types'
import { generateReportHtml } from '../../report-export/reportHtmlDocument'
import { buildReportEmbeddedData } from '../../report-export/reportExportData'
import { createWorkbook } from './exportWorkbook'

export interface ZipExportOptions {
  includeExcel?: boolean
  /** Controls the ZIP `reports/` folder and HTML files inside it. */
  includeReportHtml?: boolean
  /** When true, also write a PDF next to each report HTML. */
  includeReportPdf?: boolean
  onProgress?: (message: string, percent: number) => void
}

type ProgressCallback = (message: string, percent: number) => void
type ReportPdfRenderer = typeof import('@/report/export/pdfExport').renderReportPdfBlob

const EXCEL_START = 15
const EXCEL_END = 45
const REPORTS_END = 92

function scaleWorkbookProgress(onProgress?: ProgressCallback): ProgressCallback | undefined {
  if (!onProgress) return undefined
  return (message, percent) => {
    const scaled = EXCEL_START + (percent - 30) / 50 * (EXCEL_END - EXCEL_START)
    onProgress(message, Math.round(Math.min(EXCEL_END, Math.max(EXCEL_START, scaled))))
  }
}

interface ReportExportOptions {
  includePdf: boolean
  onProgress?: ProgressCallback
}

function uniqueReportBaseName(name: string, used: Set<string>): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, '_').trim().substring(0, 50)
    || 'Untitled Report'
  let candidate = sanitized
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${sanitized} (${suffix})`
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

async function addReports(
  zip: JSZipInstance,
  reports: Awaited<ReturnType<typeof loadReportsForProject>>,
  nodes: Record<string, ProjectNode>,
  { includePdf, onProgress }: ReportExportOptions,
): Promise<void> {
  const entries = Object.values(reports)
  if (entries.length === 0) return

  const folder = zip.folder('reports')
  const usedBaseNames = new Set<string>()
  let renderReportPdfBlob: ReportPdfRenderer | null = null
  if (includePdf) {
    renderReportPdfBlob = (await import('@/report/export/pdfExport')).renderReportPdfBlob
  }

  for (const [index, report] of entries.entries()) {
    onProgress?.(
      `Rendering report ${index + 1} of ${entries.length}...`,
      Math.round(EXCEL_END + index / entries.length * (REPORTS_END - EXCEL_END)),
    )
    const baseName = uniqueReportBaseName(report.name, usedBaseNames)
    const dataMap = await buildReportEmbeddedData(report, nodes)

    folder?.file(`${baseName}.html`, generateReportHtml(report, dataMap))
    if (renderReportPdfBlob) {
      try {
        folder?.file(`${baseName}.pdf`, await renderReportPdfBlob({ report, nodes, dataMap }))
      } catch (error) {
        console.error(`[Export] Failed to render PDF for report "${report.name}":`, error)
      }
    }
  }
}

export async function exportProjectAsZip(
  projectId: string,
  options: ZipExportOptions = {},
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const {
    includeExcel = true,
    includeReportHtml = true,
    includeReportPdf = true,
    onProgress,
  } = options

  onProgress?.('Preparing project data...', 5)
  zip.file('project.tablecanvas.json', await (await exportProjectFile(projectId)).text())

  const project = includeExcel || includeReportHtml ? await loadProject(projectId) : null
  if ((includeExcel || includeReportHtml) && !project) throw new Error('Project not found')

  if (includeExcel) {
    onProgress?.('Creating Excel workbook...', EXCEL_START)
    const workbook = await createWorkbook(project!.nodes, scaleWorkbookProgress(onProgress))
    if (workbook) zip.file('data.xlsx', workbook)
  }

  if (includeReportHtml) {
    onProgress?.('Exporting reports...', EXCEL_END)
    await addReports(zip, await loadReportsForProject(projectId), project!.nodes, {
      includePdf: includeReportPdf,
      onProgress,
    })
  }

  onProgress?.('Compressing...', 95)
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
