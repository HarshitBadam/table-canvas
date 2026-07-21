import * as XLSX from 'xlsx'
import { getTableData } from '@/engine/tableDataService'
import type { ProjectNode, TableNode } from '@/types'
import { getTableNodes } from '@/lib/utils'
import { computeDisplayValue } from '@/grid/displayUtils'
import type { TableRow } from '@/state/dataStore'

const EXPORT_PAGE_SIZE = 50_000

function sanitizeSheetName(name: string): string {
  return Array.from(name, character => character.charCodeAt(0) < 32 ? '_' : character)
    .join('')
    .replace(/[[\]:*?/\\]/g, '_')
    .trim()
    .replace(/^'+|'+$/g, '')
    .substring(0, 31)
    || 'Sheet'
}

function makeSheetNamesUnique(names: string[]): string[] {
  const usedNames = new Set<string>()
  return names.map(name => {
    const base = sanitizeSheetName(name)
    let candidate = base
    let suffixNumber = 1
    while (usedNames.has(candidate.toLocaleLowerCase())) {
      const suffix = ` (${suffixNumber})`
      candidate = `${base.substring(0, 31 - suffix.length)}${suffix}`
      suffixNumber += 1
    }
    usedNames.add(candidate.toLocaleLowerCase())
    return candidate
  })
}

function addErrorSheet(workbook: XLSX.WorkBook, sheetName: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Error exporting table'],
    [message],
  ]), sheetName)
}

function createWorksheet(table: TableNode, rows: Record<string, unknown>[]): XLSX.WorkSheet {
  const columns = table.schema?.columns ?? []
  const headers = columns.length > 0
    ? columns.map(column => column.name)
    : Object.keys(rows[0] ?? {}).filter(key => !key.startsWith('__'))
  const keys = columns.length > 0 ? columns.map(column => column.id) : headers
  const columnsById = new Map(columns.map((column) => [column.id, column]))
  const data: unknown[][] = [
    headers,
    ...rows.map((row, rowIndex) => keys.map((key) => {
      const column = columnsById.get(key)
      const rowId = typeof row.__rowId === 'string' ? row.__rowId : `row_${rowIndex}`
      const value = column?.isComputed
        ? computeDisplayValue(
            rowId,
            key,
            null,
            row as unknown as TableRow,
            columns,
          )
        : row[key]
      return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value
    })),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  worksheet['!cols'] = headers.map((header, index) => ({
    wch: Math.max(header.length, ...data.slice(1, 101).map(row => String(row[index] ?? '').length).map(length => Math.min(length, 50))) + 2,
  }))
  return worksheet
}

async function readAllTableRows(tableId: string): Promise<TableRow[]> {
  const firstPage = await getTableData(tableId, 0, EXPORT_PAGE_SIZE)
  if (firstPage.error) throw new Error(firstPage.error)

  const expectedTotal = firstPage.totalRows
  const rows = [...firstPage.rows]
  while (rows.length < expectedTotal) {
    const page = await getTableData(
      tableId,
      rows.length,
      Math.min(EXPORT_PAGE_SIZE, expectedTotal - rows.length),
    )
    if (page.error) throw new Error(page.error)
    if (page.totalRows !== expectedTotal) {
      throw new Error('The table changed while it was being exported. Please try again.')
    }
    if (page.rows.length === 0) {
      throw new Error(
        `Only ${rows.length.toLocaleString()} of ${expectedTotal.toLocaleString()} rows could be read`,
      )
    }
    rows.push(...page.rows)
  }
  return rows
}

export async function createWorkbook(
  nodes: Record<string, ProjectNode>,
  onProgress?: (message: string, percent: number) => void,
): Promise<ArrayBuffer | null> {
  const tables = getTableNodes(nodes)
  if (tables.length === 0) return null

  const workbook = XLSX.utils.book_new()
  const sheetNames = makeSheetNamesUnique(tables.map(table => table.name))

  for (const [index, table] of tables.entries()) {
    const sheetName = sheetNames[index]
    onProgress?.(`Exporting table: ${table.name}...`, 30 + Math.round(index / tables.length * 50))
    try {
      const rows = await readAllTableRows(table.id)
      if (rows.length === 0) {
        const headers = table.schema?.columns.map(column => column.name) ?? ['(empty)']
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), sheetName)
        continue
      }
      XLSX.utils.book_append_sheet(workbook, createWorksheet(table, rows), sheetName)
    } catch (error) {
      addErrorSheet(workbook, sheetName, error)
    }
  }

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true })
}
