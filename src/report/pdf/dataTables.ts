import type { Content } from 'pdfmake/interfaces'
import type { EmbeddedDataMap } from '@/persistence/report-export/reportHtmlGenerator'
import { placeholder } from './boxes'
import { tableBlocks, truncationNote } from './tables'

const INLINE_ROW_CAP = 1_000

function cellText(value: unknown): string {
  return value == null ? '' : String(value)
}

export function embeddedTableBlocks(
  attrs: Record<string, unknown>,
  dataMap: EmbeddedDataMap,
  topLevel: boolean,
): Content[] {
  const entry = dataMap[String(attrs.sourceTableId ?? '')]
  if (!entry || entry.rows.length === 0) {
    return [placeholder('[Embedded Table — no data available]')]
  }

  const selectedColumns = Array.isArray(attrs.selectedColumns)
    ? (attrs.selectedColumns as string[])
    : []
  const columnIds = selectedColumns.length > 0
    ? selectedColumns.filter((id) => entry.headers.includes(id))
    : entry.headers
  if (columnIds.length === 0) {
    return [placeholder('[Embedded Table — no columns selected]')]
  }

  const rowSelectionMode = String(attrs.rowSelectionMode || 'first_n')
  const rowLimit = (attrs.rowLimit as number) || 10
  let rows = entry.rows
  if (rowSelectionMode === 'first_n') rows = rows.slice(0, rowLimit)
  else if (rowSelectionMode === 'last_n') rows = rows.slice(-rowLimit)

  return tableBlocks({
    headers: columnIds.map((id) => entry.columnNames?.[id] || id),
    rows: rows.map((row) => columnIds.map((id) => cellText(row[id]))),
    showHeaders: true,
    caption: typeof attrs.caption === 'string' ? attrs.caption : undefined,
    captionAbove: true,
    note: truncationNote(
      rows.length,
      entry.rows.length,
      columnIds.length,
      entry.headers.length,
      rowSelectionMode === 'last_n' ? 'last' : 'first',
    ),
    allowLandscape: topLevel,
  })
}

export function inlineTableBlocks(
  attrs: Record<string, unknown>,
  topLevel: boolean,
): Content[] {
  const headers = Array.isArray(attrs.headers)
    ? attrs.headers.map((value) => cellText(value))
    : []
  if (headers.length === 0) return [placeholder('[Empty table]')]

  const sourceRows = Array.isArray(attrs.rows) ? attrs.rows.filter(Array.isArray) : []
  const rows = sourceRows.slice(0, INLINE_ROW_CAP) as unknown[][]

  return tableBlocks({
    headers,
    rows: rows.map((row) => headers.map((_, index) => cellText(row[index]))),
    showHeaders: attrs.showHeaders !== false,
    caption: typeof attrs.caption === 'string' ? attrs.caption : undefined,
    note: sourceRows.length > rows.length
      ? `Showing the first ${rows.length.toLocaleString()} rows.`
      : undefined,
    allowLandscape: topLevel,
  })
}
