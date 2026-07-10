import * as XLSX from 'xlsx'
import { getTableData } from '@/engine/materializationService'
import type { ProjectNode, TableNode } from '@/types'
import { getTableNodes } from '@/lib/utils'

function sanitizeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, '_').substring(0, 31).trim() || 'Sheet'
}

function makeSheetNamesUnique(names: string[]): string[] {
  const counts: Record<string, number> = {}
  return names.map(name => {
    const base = sanitizeSheetName(name)
    const count = counts[base] ?? 0
    counts[base] = count + 1
    if (count === 0) return base
    const suffix = ` (${count})`
    return `${base.substring(0, 31 - suffix.length)}${suffix}`
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
  const data: unknown[][] = [
    headers,
    ...rows.map(row => keys.map(key => {
      const value = row[key]
      return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value
    })),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  worksheet['!cols'] = headers.map((header, index) => ({
    wch: Math.max(header.length, ...data.slice(1, 101).map(row => String(row[index] ?? '').length).map(length => Math.min(length, 50))) + 2,
  }))
  return worksheet
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
      const { rows, error } = await getTableData(table.id, 0, 1_000_000)
      if (error) {
        addErrorSheet(workbook, sheetName, new Error(error))
        continue
      }
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
