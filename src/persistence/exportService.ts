/**
 * Export Service
 * 
 * Handles full project export as a ZIP archive containing:
 * - tablecanvas.json: Full project state with embedded files
 * - data.xlsx: Excel workbook with all tables as sheets
 */

import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { exportProjectFile, loadProject, loadAllReports, } from './db'
import { getTableData, ensureTableMaterialized } from '@/engine/materializationService'
import { useDataStore } from '@/state/dataStore'
import type { SourceTableNode } from '@/types'
import { generateReportHtml, collectEmbeddedTableIds, buildEmbeddedDataMap } from './reportHtmlGenerator'
import { makeSheetNamesUnique, getTableNodes, loadSourceTableData } from './excelHelpers'

export interface ZipExportOptions {
  includeExcel?: boolean
  includeReportHtml?: boolean
  onProgress?: (message: string, percent: number) => void
}

/**
 * Returns null if there are no tables.
 */
async function buildExcelWorkbook(
  projectId: string,
  onProgress?: (message: string, percent: number) => void,
): Promise<ArrayBuffer | null> {
  const project = await loadProject(projectId)
  if (!project) {
    throw new Error('Project not found')
  }

  const tableNodes = getTableNodes(project.nodes)
  if (tableNodes.length === 0) return null

  const workbook = XLSX.utils.book_new()
  const sheetNames = makeSheetNamesUnique(tableNodes.map(t => t.name))

  let processed = 0
  const totalTables = tableNodes.length

  for (let i = 0; i < tableNodes.length; i++) {
    const table = tableNodes[i]
    const sheetName = sheetNames[i]

    onProgress?.(
      `Exporting table: ${table.name}...`,
      30 + Math.round((processed / totalTables) * 50)
    )

    try {
      let rows: Record<string, unknown>[] = []

      if (table.kind === 'source_table') {
        console.log(`[Export] Loading source table ${table.name} directly from file...`)
        rows = await loadSourceTableData(table as SourceTableNode)
      } else {
        console.log(`[Export] Materializing derived table: ${table.name}...`)
        const materializeResult = await ensureTableMaterialized(table.id)

        if (materializeResult.status === 'error') {
          console.error(`[Export] Failed to materialize table ${table.name}:`, materializeResult.error)
          appendErrorSheet(workbook, sheetName, table.schema?.columns.map(c => c.name), materializeResult.error)
          processed++
          continue
        }

        const { rows: tableRows, error } = await getTableData(table.id, 0, 100000)

        if (error) {
          console.error(`[Export] Error getting data for table ${table.name}:`, error)
          appendErrorSheet(workbook, sheetName, table.schema?.columns.map(c => c.name), error)
          processed++
          continue
        }

        rows = tableRows as Record<string, unknown>[]

        // Fall back to in-memory data store if materialization returned nothing
        if (rows.length === 0) {
          const dataStore = useDataStore.getState()
          const storeData = dataStore.tableData[table.id]
          if (storeData?.rows && storeData.rows.length > 0) {
            rows = storeData.rows as Record<string, unknown>[]
            console.log(`[Export] Got ${rows.length} rows from data store for ${table.name}`)
          }
        }
      }

      console.log(`[Export] Table ${table.name}: ${rows.length} rows`)

      if (rows.length > 0) {
        const columns = table.schema?.columns.map(c => c.name) ||
                         Object.keys(rows[0]).filter(k => !k.startsWith('__'))

        const data: unknown[][] = [columns]
        for (const row of rows) {
          data.push(columns.map(col => {
            const value = row[col]
            if (value === null || value === undefined) return ''
            if (typeof value === 'object') return JSON.stringify(value)
            return value
          }))
        }

        const worksheet = XLSX.utils.aoa_to_sheet(data)

        // Approximate auto-size based on first 100 rows
        worksheet['!cols'] = columns.map((col, idx) => {
          let maxWidth = col.length
          for (let r = 0; r < Math.min(100, rows.length); r++) {
            const cellValue = String(data[r + 1]?.[idx] ?? '')
            maxWidth = Math.max(maxWidth, Math.min(cellValue.length, 50))
          }
          return { wch: maxWidth + 2 }
        })

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        console.log(`[Export] Added sheet "${sheetName}" with ${rows.length} rows`)
      } else {
        console.warn(`[Export] Table "${table.name}" returned 0 rows`)
        const columns = table.schema?.columns.map(c => c.name) || ['(empty)']
        const worksheet = XLSX.utils.aoa_to_sheet([columns])
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        console.log(`[Export] Added empty sheet "${sheetName}"`)
      }
    } catch (err) {
      console.error(`[Export] Failed to export table ${table.name}:`, err)
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Error exporting table'],
        [err instanceof Error ? err.message : 'Unknown error']
      ])
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    }

    processed++
  }

  return XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    compression: true
  })
}

function appendErrorSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  columnNames: string[] | undefined,
  errorMessage: string | undefined,
): void {
  const columns = columnNames || ['Error']
  const worksheet = XLSX.utils.aoa_to_sheet([
    columns,
    [`Error: ${errorMessage}`]
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
}

async function addReportsToZip(zip: JSZip): Promise<void> {
  const reports = await loadAllReports()
  const reportEntries = Object.values(reports)

  if (reportEntries.length === 0) return

  const reportsFolder = zip.folder('reports')

  for (const report of reportEntries) {
    const safeName = report.name.replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 50)
    const filename = `${safeName}.html`

    let dataMap = {}
    if (report.tiptapContent) {
      const embeddedRefs = collectEmbeddedTableIds(report.tiptapContent)
      const uniqueTableIds = [...new Set(embeddedRefs.map(r => r.tableId))]
      const fetched = await Promise.all(
        uniqueTableIds.map(async (tableId) => {
          const maxLimit = Math.max(
            ...embeddedRefs.filter(r => r.tableId === tableId).map(r => r.rowLimit),
          )
          const result = await getTableData(tableId, 0, maxLimit)
          return { tableId, rows: result.rows }
        }),
      )
      dataMap = buildEmbeddedDataMap(fetched)
    }

    const html = generateReportHtml(report, dataMap)
    reportsFolder?.file(filename, html)
    console.log(`[Export] Added report: ${filename}`)
  }

  console.log(`[Export] Added ${reportEntries.length} reports to ZIP`)
}

/**
 * Export project as a ZIP archive.
 *
 * Contents:
 * - project.tablecanvas.json: Full project data with embedded files
 * - data.xlsx: Excel workbook with all tables as separate sheets
 * - reports/: HTML exports of reports
 */
export async function exportProjectAsZip(
  projectId: string,
  options: ZipExportOptions = {}
): Promise<Blob> {
  const {
    includeExcel = true,
    onProgress,
  } = options

  const zip = new JSZip()

  onProgress?.('Preparing project data...', 10)
  const projectBlob = await exportProjectFile(projectId)
  const projectJson = await projectBlob.text()
  zip.file('project.tablecanvas.json', projectJson)

  if (includeExcel) {
    onProgress?.('Creating Excel workbook...', 30)
    const excelBuffer = await buildExcelWorkbook(projectId, onProgress)
    if (excelBuffer) {
      onProgress?.('Writing Excel file...', 85)
      zip.file('data.xlsx', excelBuffer)
    }
  }

  const includeReports = options.includeReportHtml ?? true
  if (includeReports) {
    onProgress?.('Exporting reports...', 90)
    await addReportsToZip(zip)
  }

  onProgress?.('Compressing...', 98)
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  onProgress?.('Complete!', 100)
  console.log(`[Export] ZIP created: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`)

  return zipBlob
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportAndDownloadProject(
  projectId: string,
  projectName: string,
  options?: ZipExportOptions
): Promise<void> {
  const zipBlob = await exportProjectAsZip(projectId, options)

  const date = new Date().toISOString().split('T')[0]
  const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_')
  const filename = `${safeName}_${date}.tablecanvas.zip`

  downloadBlob(zipBlob, filename)
}
