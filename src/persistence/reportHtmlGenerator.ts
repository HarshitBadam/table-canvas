import type { Report } from '@/report/types'
import type { JSONContent } from '@tiptap/core'
import type { TableRow } from '@/state/dataStore'
import type { ProjectNode, TableNode } from '@/types'

export interface EmbeddedTableData {
  tableName: string
  headers: string[]
  columnNames?: Record<string, string>
  rows: Record<string, unknown>[]
}

export type EmbeddedDataMap = Record<string, EmbeddedTableData>

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderEmbeddedTable(
  tableId: string,
  attrs: Record<string, unknown>,
  dataMap: EmbeddedDataMap,
): string {
  const entry = dataMap[tableId]
  if (!entry || entry.rows.length === 0) {
    return `<div class="block-placeholder">[Embedded Table: ${entry?.tableName || 'unknown'} — no data]</div>\n`
  }

  const selectedColumns = (attrs.selectedColumns as string[]) || []
  const rowSelectionMode = (attrs.rowSelectionMode as string) || 'first_n'
  const rowLimit = (attrs.rowLimit as number) || 10
  const caption = attrs.caption as string | undefined

  const displayHeaders = selectedColumns.length > 0
    ? selectedColumns.filter(id => entry.headers.includes(id))
    : entry.headers

  let displayRows = entry.rows
  if (rowSelectionMode === 'first_n') {
    displayRows = displayRows.slice(0, rowLimit)
  } else if (rowSelectionMode === 'last_n') {
    displayRows = displayRows.slice(-rowLimit)
  }

  let html = ''
  if (caption) {
    html += `<p><em>${escapeHtml(caption)}</em></p>\n`
  }
  html += '<table border="1" style="border-collapse: collapse; width: 100%;">\n'
  html += '<thead><tr>'
  for (const colId of displayHeaders) {
    const name = entry.columnNames?.[colId] || colId
    html += `<th style="padding: 8px; text-align: left;">${escapeHtml(name)}</th>`
  }
  html += '</tr></thead>\n<tbody>'
  for (const row of displayRows) {
    html += '<tr>'
    for (const colId of displayHeaders) {
      const val = row[colId]
      html += `<td style="padding: 8px;">${val != null ? escapeHtml(String(val)) : ''}</td>`
    }
    html += '</tr>\n'
  }
  html += '</tbody></table>\n'
  return html
}

function nodeToHtml(node: JSONContent, dataMap: EmbeddedDataMap): string {
  if (!node) return ''

  const nodeType = node.type ?? ''

  switch (nodeType) {
    case 'paragraph': {
      const pContent = node.content?.map((n) => nodeToHtml(n, dataMap)).join('') || ''
      return `<p>${pContent}</p>\n`
    }

    case 'heading': {
      const level = node.attrs?.level || 1
      const hContent = node.content?.map((n) => nodeToHtml(n, dataMap)).join('') || ''
      return `<h${level}>${hContent}</h${level}>\n`
    }

    case 'text': {
      let text = escapeHtml(node.text || '')
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
      const ulItems = node.content?.map((n) => nodeToHtml(n, dataMap)).join('') || ''
      return `<ul>${ulItems}</ul>\n`
    }

    case 'orderedList': {
      const olItems = node.content?.map((n) => nodeToHtml(n, dataMap)).join('') || ''
      return `<ol>${olItems}</ol>\n`
    }

    case 'listItem': {
      const liContent = node.content?.map((n) => nodeToHtml(n, dataMap)).join('') || ''
      return `<li>${liContent}</li>\n`
    }

    case 'blockquote': {
      const bqContent = node.content?.map((n) => nodeToHtml(n, dataMap)).join('') || ''
      return `<blockquote>${bqContent}</blockquote>\n`
    }

    case 'codeBlock': {
      const codeContent = node.content?.map((n) => escapeHtml(n.text || '')).join('') || ''
      return `<pre><code>${codeContent}</code></pre>\n`
    }

    case 'horizontalRule':
      return '<hr>\n'

    case 'hardBreak':
      return '<br>\n'

    case 'embeddedTable': {
      const tableId = node.attrs?.sourceTableId as string
      if (tableId && dataMap[tableId]) {
        return renderEmbeddedTable(tableId, node.attrs || {}, dataMap)
      }
      return `<div class="block-placeholder">[Embedded Table — no data available]</div>\n`
    }

    case 'chartBlock': {
      const chartTableId = node.attrs?.sourceTableId as string
      const chartType = node.attrs?.chartType as string || 'chart'
      const chartEntry = chartTableId ? dataMap[chartTableId] : undefined
      if (chartEntry) {
        return `<div class="block-placeholder">[Chart: ${escapeHtml(chartType)} — source: ${escapeHtml(chartEntry.tableName)}, ${chartEntry.rows.length} rows]</div>\n`
      }
      return `<div class="block-placeholder">[Chart: ${escapeHtml(chartType)}]</div>\n`
    }

    case 'tableBlock':
      return `<div class="block-placeholder">[${nodeType}]</div>\n`

    default:
      if (node.content) {
        return node.content.map((n) => nodeToHtml(n, dataMap)).join('')
      }
      return ''
  }
}

function tiptapToHtml(content: JSONContent, dataMap: EmbeddedDataMap): string {
  if (!content || !content.content) return ''

  let html = ''
  for (const node of content.content) {
    html += nodeToHtml(node, dataMap)
  }
  return html
}

/**
 * Collect all embedded table/chart source table IDs from TipTap content,
 * so callers can pre-fetch data.
 */
export function collectEmbeddedTableIds(content: JSONContent): Array<{ tableId: string; rowLimit: number }> {
  const results: Array<{ tableId: string; rowLimit: number }> = []

  function walk(node: JSONContent) {
    if (!node) return

    if (node.type === 'embeddedTable' || node.type === 'chartBlock') {
      const tableId = node.attrs?.sourceTableId as string
      if (tableId) {
        const rowLimit = (node.attrs?.rowLimit as number) || 1000
        results.push({ tableId, rowLimit })
      }
    }

    if (node.content) {
      for (const child of node.content) {
        walk(child)
      }
    }
  }

  walk(content)
  return results
}

export function buildEmbeddedDataMap(
  entries: Array<{ tableId: string; rows: TableRow[] }>,
  nodes: Record<string, ProjectNode>,
): EmbeddedDataMap {
  const map: EmbeddedDataMap = {}

  for (const { tableId, rows } of entries) {
    const tableNode = nodes[tableId] as TableNode | undefined
    const columns = tableNode?.schema?.columns ?? []
    const colIds = columns.map(column => column.id)
    map[tableId] = {
      tableName: tableNode?.name || tableId,
      headers: colIds.length > 0 ? colIds : (rows.length > 0 ? Object.keys(rows[0]).filter(k => k !== '__rowId') : []),
      columnNames: Object.fromEntries(columns.map(column => [column.id, column.name])),
      rows,
    }
  }

  return map
}

export function generateReportHtml(report: Report, dataMap: EmbeddedDataMap = {}): string {
  let content = ''

  if (report.tiptapContent && report.tiptapContent.content && report.tiptapContent.content.length > 0) {
    content = tiptapToHtml(report.tiptapContent, dataMap)
  } else {
    content = '<p><em>This report is empty.</em></p>'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.name)} - Table Canvas Report</title>
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
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
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
  <h1>${escapeHtml(report.name)}</h1>
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
