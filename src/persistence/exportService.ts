/**
 * Export Service
 *
 * Handles full project export as a ZIP archive containing:
 * - tablecanvas.json: Full project state with embedded files
 * - data.xlsx: Excel workbook with all tables as sheets
 */

import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { exportProjectFile, loadProject, loadAllReports } from './db'
import { getTableData } from '@/engine/materializationService'
import type { ProjectNode, TableNode } from '@/types'
import type { Report } from '@/report/types'

/**
 * Options for ZIP export
 */
export interface ZipExportOptions {
  includeExcel?: boolean       // Include data.xlsx with all tables (default: true)
  includeReportHtml?: boolean  // Include HTML exports of reports (default: true)
  onProgress?: (message: string, percent: number) => void
}

interface TipTapNode {
  type: string
  content?: TipTapNode[]
  text?: string
  marks?: Array<{ type: string }>
  attrs?: Record<string, unknown>
}

interface TipTapContent {
  content?: TipTapNode[]
}

/**
 * Convert TipTap content to HTML string
 */
function tiptapToHtml(content: TipTapContent): string {
  if (!content || !content.content) return ''

  let html = ''

  for (const node of content.content) {
    html += nodeToHtml(node)
  }

  return html
}

/**
 * Convert a single TipTap node to HTML
 */
function nodeToHtml(node: TipTapNode): string {
  if (!node) return ''

  switch (node.type) {
    case 'paragraph': {
      const pContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<p>${pContent}</p>\n`
    }

    case 'heading': {
      const level = node.attrs?.level || 1
      const hContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<h${level}>${hContent}</h${level}>\n`
    }

    case 'text': {
      let text = node.text || ''
      // Apply marks
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold':
              text = `<strong>${text}</strong>`
              break
            case 'italic':
              text = `<em>${text}</em>`
              break
            case 'underline':
              text = `<u>${text}</u>`
              break
            case 'code':
              text = `<code>${text}</code>`
              break
          }
        }
      }
      return text
    }

    case 'bulletList': {
      const ulItems = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<ul>${ulItems}</ul>\n`
    }

    case 'orderedList': {
      const olItems = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<ol>${olItems}</ol>\n`
    }

    case 'listItem': {
      const liContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<li>${liContent}</li>\n`
    }

    case 'blockquote': {
      const bqContent = node.content?.map((n) => nodeToHtml(n)).join('') || ''
      return `<blockquote>${bqContent}</blockquote>\n`
    }

    case 'codeBlock': {
      const codeContent = node.content?.map((n) => n.text || '').join('') || ''
      return `<pre><code>${codeContent}</code></pre>\n`
    }

    case 'horizontalRule':
      return '<hr>\n'

    case 'hardBreak':
      return '<br>\n'

    case 'tableBlock':
    case 'chartBlock':
      // These are custom nodes - render as placeholders
      return `<div class="block-placeholder">[${node.type}]</div>\n`

    default:
      // Unknown node type - try to render content
      if (node.content) {
        return node.content.map((n) => nodeToHtml(n)).join('')
      }
      return ''
  }
}

/**
 * Generate HTML page for a report
 */
function generateReportHtml(report: Report): string {
  let content = ''

  if (report.tiptapContent && report.tiptapContent.content && report.tiptapContent.content.length > 0) {
    content = tiptapToHtml(report.tiptapContent)
  } else {
    content = '<p><em>This report is empty.</em></p>'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.name} - Table Canvas Report</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      color: #1a1a1a;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #217346; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    li { margin: 0.5em 0; }
    blockquote {
      border-left: 4px solid #217346;
      margin: 1em 0;
      padding: 0.5em 1em;
      background: #f9f9f9;
    }
    pre {
      background: #f4f4f4;
      padding: 1em;
      border-radius: 4px;
      overflow-x: auto;
    }
    code {
      background: #f4f4f4;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Monaco', 'Consolas', monospace;
    }
    pre code {
      background: none;
      padding: 0;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 2em 0;
    }
    .block-placeholder {
      background: #f0f0f0;
      border: 1px dashed #ccc;
      padding: 1em;
      text-align: center;
      color: #666;
      margin: 1em 0;
    }
    .report-meta {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 2em;
      padding-bottom: 1em;
      border-bottom: 1px solid #eee;
    }
    .footer {
      margin-top: 3em;
      padding-top: 1em;
      border-top: 1px solid #eee;
      color: #666;
      font-size: 0.8em;
    }
    @media print {
      body { padding: 20px; }
      .footer { display: none; }
    }
  </style>
</head>
<body>
  <h1>${report.name}</h1>
  <div class="report-meta">
    Created: ${new Date(report.createdAt).toLocaleDateString()}<br>
    Last updated: ${new Date(report.updatedAt).toLocaleDateString()}
  </div>

  <div class="content">
    ${content}
  </div>

  <div class="footer">
    Exported from Table Canvas on ${new Date().toLocaleDateString()}
  </div>
</body>
</html>`
}

/**
 * Sanitize sheet name for Excel (max 31 chars, no special chars)
 */
function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no []:*?/\
  let sanitized = name
    .replace(/[[\]:*?/\\]/g, '_')
    .substring(0, 31)

  // Ensure unique name if empty
  if (!sanitized.trim()) {
    sanitized = 'Sheet'
  }

  return sanitized
}

/**
 * Make sheet names unique by appending numbers
 */
function makeSheetNamesUnique(names: string[]): string[] {
  const counts: Record<string, number> = {}
  const result: string[] = []

  for (const name of names) {
    const baseName = sanitizeSheetName(name)
    if (counts[baseName] === undefined) {
      counts[baseName] = 0
      result.push(baseName)
    } else {
      counts[baseName]++
      // Ensure the numbered name is also within 31 chars
      const suffix = ` (${counts[baseName]})`
      const truncatedBase = baseName.substring(0, 31 - suffix.length)
      result.push(truncatedBase + suffix)
    }
  }

  return result
}

/**
 * Get all table nodes (source and derived) sorted by creation date
 */
function getTableNodes(nodes: Record<string, ProjectNode>): TableNode[] {
  return Object.values(nodes)
    .filter((node): node is TableNode =>
      node.kind === 'source_table' || node.kind === 'derived_table'
    )
    .sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
}

/**
 * Export project as a ZIP archive
 *
 * Creates a ZIP file containing:
 * - project.tablecanvas.json: Full project data with embedded files
 * - data.xlsx: Excel workbook with all tables as separate sheets
 *
 * @param projectId - The project ID to export
 * @param options - Export options
 * @returns Blob of the ZIP file
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

  // Step 1: Get the tablecanvas.json export
  onProgress?.('Preparing project data...', 10)
  const projectBlob = await exportProjectFile(projectId)
  const projectJson = await projectBlob.text()
  zip.file('project.tablecanvas.json', projectJson)

  // Step 2: Create Excel workbook with all tables
  if (includeExcel) {
    onProgress?.('Creating Excel workbook...', 30)

    const project = await loadProject(projectId)
    if (!project) {
      throw new Error('Project not found')
    }

    const tableNodes = getTableNodes(project.nodes)

    if (tableNodes.length > 0) {
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
          // Every table (source or derived) is read through the single
          // canonical, id-keyed read API. Materialization loads source files /
          // computes derived tables and populates the id-keyed data store.
          console.log(`[Export] Reading table: ${table.name}...`)
          const { rows, error } = await getTableData(table.id, 0, 1_000_000)

          if (error) {
            console.error(`[Export] Error getting data for table ${table.name}:`, error)
            const headers = table.schema?.columns.map(c => c.name) || ['Error']
            const worksheet = XLSX.utils.aoa_to_sheet([headers, [`Error: ${error}`]])
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
            processed++
            continue
          }

          console.log(`[Export] Table ${table.name}: ${rows.length} rows`)

          if (rows.length > 0) {
            // Header row uses human-readable column names; cell values are read
            // by column id, which is the data store's canonical row key.
            const schemaColumns = table.schema?.columns ?? []
            const headers = schemaColumns.length > 0
              ? schemaColumns.map(c => c.name)
              : Object.keys(rows[0]).filter(k => !k.startsWith('__'))
            const cellKeys = schemaColumns.length > 0
              ? schemaColumns.map(c => c.id)
              : headers

            // Prepare data for Excel (array of arrays)
            const data: unknown[][] = [headers] // Header row

            for (const row of rows) {
              const rowData = cellKeys.map(key => {
                const value = (row as Record<string, unknown>)[key]
                // Handle special types
                if (value === null || value === undefined) return ''
                if (typeof value === 'object') return JSON.stringify(value)
                return value
              })
              data.push(rowData)
            }

            // Create worksheet
            const worksheet = XLSX.utils.aoa_to_sheet(data)

            // Auto-size columns (approximate)
            const colWidths = headers.map((header, idx) => {
              let maxWidth = header.length
              // Check first 100 rows for max width
              for (let r = 0; r < Math.min(100, rows.length); r++) {
                const cellValue = String(data[r + 1]?.[idx] ?? '')
                maxWidth = Math.max(maxWidth, Math.min(cellValue.length, 50))
              }
              return { wch: maxWidth + 2 }
            })
            worksheet['!cols'] = colWidths

            // Add to workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

            console.log(`[Export] Added sheet "${sheetName}" with ${rows.length} rows`)
          } else {
            // Empty table - create empty sheet with headers
            console.warn(`[Export] Table "${table.name}" returned 0 rows`)
            const headers = table.schema?.columns.map(c => c.name) || ['(empty)']
            const worksheet = XLSX.utils.aoa_to_sheet([headers])
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
            console.log(`[Export] Added empty sheet "${sheetName}"`)
          }
        } catch (err) {
          console.error(`[Export] Failed to export table ${table.name}:`, err)
          // Add error sheet
          const worksheet = XLSX.utils.aoa_to_sheet([
            ['Error exporting table'],
            [err instanceof Error ? err.message : 'Unknown error']
          ])
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        }

        processed++
      }

      // Write workbook to buffer
      onProgress?.('Writing Excel file...', 85)
      const excelBuffer = XLSX.write(workbook, {
        type: 'array',
        bookType: 'xlsx',
        compression: true
      })

      zip.file('data.xlsx', excelBuffer)
    }
  }

  // Step 3: Export reports as HTML files
  const includeReports = options.includeReportHtml ?? true
  if (includeReports) {
    onProgress?.('Exporting reports...', 90)

    const reports = await loadAllReports()
    const reportEntries = Object.values(reports)

    if (reportEntries.length > 0) {
      const reportsFolder = zip.folder('reports')

      for (const report of reportEntries) {
        // Sanitize filename
        const safeName = report.name.replace(/[^a-zA-Z0-9-_ ]/g, '_').substring(0, 50)
        const filename = `${safeName}.html`

        const html = generateReportHtml(report)
        reportsFolder?.file(filename, html)

        console.log(`[Export] Added report: ${filename}`)
      }

      console.log(`[Export] Added ${reportEntries.length} reports to ZIP`)
    }
  }

  // Generate ZIP
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

/**
 * Trigger download of a blob as a file
 */
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

/**
 * Export project as ZIP and trigger download
 */
export async function exportAndDownloadProject(
  projectId: string,
  projectName: string,
  options?: ZipExportOptions
): Promise<void> {
  const zipBlob = await exportProjectAsZip(projectId, options)

  // Create filename: ProjectName_YYYY-MM-DD.tablecanvas.zip
  const date = new Date().toISOString().split('T')[0]
  const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_')
  const filename = `${safeName}_${date}.tablecanvas.zip`

  downloadBlob(zipBlob, filename)
}
