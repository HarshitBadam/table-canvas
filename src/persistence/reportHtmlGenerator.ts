import type { JSONContent } from '@tiptap/core'
import type { TableRow } from '@/state/dataStore'
import type { ProjectNode, TableNode } from '@/types'
import { escapeHtml, renderInlineTable, safeLink, wrapTable } from './reportHtmlUtils'
import { renderReportChart } from './reportHtmlChart'

function isUnconfigured(node: JSONContent): boolean {
  if (node.type !== 'embeddedTable' && node.type !== 'chartBlock') return false
  if (!node.attrs?.sourceTableId) return true
  if (node.type !== 'chartBlock') return false
  const config = (node.attrs.config ?? {}) as Record<string, unknown>
  return !config.xAxis || !config.yAxis
}

interface EmbeddedTableData {
  tableName: string
  headers: string[]
  columnNames?: Record<string, string>
  rows: Record<string, unknown>[]
}

export type EmbeddedDataMap = Record<string, EmbeddedTableData>

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
  const headerNames = displayHeaders.map(colId => entry.columnNames?.[colId] || colId)
  const cells = displayRows.map(row => displayHeaders.map((colId) => {
    const value = row[colId]
    return value != null ? String(value) : ''
  }))

  let inner = '<thead><tr>'
  for (const name of headerNames) {
    inner += `<th>${escapeHtml(name)}</th>`
  }
  inner += '</tr></thead>\n<tbody>'
  for (const row of cells) {
    inner += '<tr>'
    for (const value of row) {
      inner += `<td>${escapeHtml(value)}</td>`
    }
    inner += '</tr>\n'
  }
  inner += '</tbody>'
  html += wrapTable({ headers: headerNames, rows: cells, showHeaders: true, inner })

  // Export caption: windowed rows/columns must not look like the full table.
  const notes: string[] = []
  if (displayRows.length < entry.rows.length) {
    const window = rowSelectionMode === 'last_n' ? 'last' : 'first'
    notes.push(`Showing the ${window} ${displayRows.length.toLocaleString()} of ${entry.rows.length.toLocaleString()} rows`)
  }
  if (displayHeaders.length < entry.headers.length) {
    notes.push(`${displayHeaders.length} of ${entry.headers.length} columns`)
  }
  if (notes.length > 0) {
    html += `<p class="table-note">${escapeHtml(notes.join(' · '))}.</p>\n`
  }
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
            case 'strike':
              text = `<s>${text}</s>`
              break
            case 'highlight':
              text = `<mark>${text}</mark>`
              break
            case 'link': {
              const href = safeLink(mark.attrs?.href)
              if (href) text = `<a href="${escapeHtml(href)}">${text}</a>`
              break
            }
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

    // Unconfigured blocks are editor-only — omit from export. Configured blocks
    // with missing data keep a placeholder so the gap is visible.
    case 'embeddedTable': {
      if (isUnconfigured(node)) return ''
      const tableId = node.attrs?.sourceTableId as string
      if (dataMap[tableId]) {
        return renderEmbeddedTable(tableId, node.attrs || {}, dataMap)
      }
      return `<div class="block-placeholder">[Embedded Table — no data available]</div>\n`
    }

    case 'chartBlock': {
      if (isUnconfigured(node)) return ''
      const chartTableId = node.attrs?.sourceTableId as string
      const chartType = node.attrs?.chartType as string || 'chart'
      const chartEntry = dataMap[chartTableId]
      if (chartEntry) {
        return renderReportChart(node.attrs || {}, chartEntry)
      }
      return `<div class="block-placeholder">[Chart: ${escapeHtml(chartType)} — no data available]</div>\n`
    }

    case 'inlineTable':
    case 'editableTable':
      return renderInlineTable(node.attrs || {})

    case 'callout': {
      const variant = ['info', 'warning', 'success', 'error'].includes(String(node.attrs?.variant))
        ? String(node.attrs?.variant)
        : 'info'
      const calloutContent = node.content?.map((child) => nodeToHtml(child, dataMap)).join('') || ''
      return `<aside class="callout callout-${variant}">${calloutContent}</aside>\n`
    }

    case 'toggle': {
      const title = escapeHtml(String(node.attrs?.title || 'Details'))
      const toggleContent = node.content?.map((child) => nodeToHtml(child, dataMap)).join('') || ''
      return `<details open><summary>${title}</summary>${toggleContent}</details>\n`
    }

    default:
      if (node.content) {
        return node.content.map((n) => nodeToHtml(n, dataMap)).join('')
      }
      return ''
  }
}

export function tiptapToHtml(content: JSONContent, dataMap: EmbeddedDataMap): string {
  if (!content || !content.content) return ''

  let html = ''
  for (const node of content.content) {
    html += nodeToHtml(node, dataMap)
  }
  return html
}

export function collectEmbeddedTableIds(content: JSONContent): Array<{ tableId: string; rowLimit: number }> {
  const results: Array<{ tableId: string; rowLimit: number }> = []

  function walk(node: JSONContent) {
    if (!node) return

    if (node.type === 'embeddedTable' || node.type === 'chartBlock') {
      const tableId = node.attrs?.sourceTableId as string
      if (tableId) {
        const rowLimit = (node.attrs?.rowLimit as number)
          || (node.type === 'chartBlock' ? 5_000 : 1_000)
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