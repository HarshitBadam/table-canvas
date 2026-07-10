import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ColumnSchema, ColumnType, TableSchema, CellValue } from '@/types'
import { TableRow } from '@/state/dataStore'
import { generateId, readFileAsText, readFileAsArrayBuffer, inferValueType } from '@/lib/utils'
import { getEngine } from '@/engine'
import { computeSourceVersionHash } from '@/engine/cacheUtils'
import { useProjectStore } from '@/state/projectStore'
import { saveFile } from '@/persistence/db'

export interface SheetInfo {
  name: string
  rowCount: number
  selected: boolean
}

export interface ParsedTableData {
  schema: TableSchema
  rows: TableRow[]
}

export interface CSVParseResult extends ParsedTableData {
  fileRef: string
}

export interface ExcelMultiSheet {
  kind: 'multi'
  workbook: XLSX.WorkBook
  buffer: ArrayBuffer
  sheets: SheetInfo[]
}

export interface ExcelSingleSheet {
  kind: 'single'
  tableData: ParsedTableData
  fileRef: string
}

export type ExcelParseResult = ExcelMultiSheet | ExcelSingleSheet

export async function loadTableIntoEngine(
  tableId: string,
  schema: TableSchema,
  rows: TableRow[]
): Promise<boolean> {
  try {
    const engine = getEngine()
    await engine.init()
    await engine.loadTable(tableId, schema, rows)

    // Stamp the same version hash loadSourceTable computes for a freshly-imported,
    // un-patched table. Without it the grid's first materialization sees a cache miss
    // and needlessly re-parses the file (and can race with this very load).
    const node = useProjectStore.getState().getTableNode(tableId)
    const fileRef = node?.kind === 'source_table' ? node.plan.fileRef : undefined
    const currentVersionHash = fileRef
      ? computeSourceVersionHash(tableId, fileRef, '0-0-0')
      : undefined

    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      lastRowCount: rows.length,
      currentVersionHash,
      error: undefined,
    })

    return true
  } catch (error) {
    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: true,
      isComputing: false,
      error: error instanceof Error ? error.message : 'Failed to load into engine',
    })
    return false
  }
}

export async function parseCSVFile(file: File): Promise<CSVParseResult> {
  const text = await readFileAsText(file)
  const buffer = await readFileAsArrayBuffer(file)

  const { data, fields } = await new Promise<{ data: Record<string, string>[]; fields: string[] }>(
    (resolve, reject) => {
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors)
          }
          resolve({ data: results.data, fields: results.meta.fields || [] })
        },
        error: (error: Error) => {
          reject(error)
        },
      })
    }
  )

  const tableData = processData(data, fields)
  const fileRef = generateId()
  await saveFile(fileRef, file.name, file.type || 'text/csv', buffer)

  return { ...tableData, fileRef }
}

export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
  const buffer = await readFileAsArrayBuffer(file)
  const wb = XLSX.read(buffer, { type: 'array' })

  if (wb.SheetNames.length === 1) {
    const tableData = parseExcelSheet(wb, wb.SheetNames[0])
    const fileRef = generateId()
    await saveFile(fileRef, file.name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer)
    return { kind: 'single', tableData, fileRef }
  }

  const sheets: SheetInfo[] = wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name]
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
    const rowCount = range.e.r - range.s.r
    return { name, rowCount, selected: true }
  })

  return { kind: 'multi', workbook: wb, buffer, sheets }
}

export function parseExcelSheet(wb: XLSX.WorkBook, sheetName: string): ParsedTableData {
  const sheet = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  if (data.length === 0) return { schema: { columns: [], rowCount: 0 }, rows: [] }

  const headerRow = data[0] as unknown[]
  const headers = headerRow.map((h, i) => String(h || `Column ${i + 1}`))
  const dataRows = data.slice(1).map((row) => {
    const rowArr = row as unknown[]
    const obj: Record<string, string> = {}
    headers.forEach((header, i) => {
      obj[header] = String(rowArr[i] ?? '')
    })
    return obj
  })

  return processData(dataRows, headers)
}

export async function importSheetAndPersist(
  wb: XLSX.WorkBook,
  sheetName: string,
  fileName: string,
  fileBuffer?: ArrayBuffer
): Promise<{ tableData: ParsedTableData; fileRef: string }> {
  const tableData = parseExcelSheet(wb, sheetName)
  const fileRef = generateId()
  if (fileBuffer) {
    await saveFile(fileRef, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileBuffer)
  }
  return { tableData, fileRef }
}

export function processData(
  data: Record<string, string>[],
  fields: string[]
): ParsedTableData {
  const columns: ColumnSchema[] = fields.map((field, index) => {
    const columnId = `col_${index}_${field.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    const sampleValues = data.slice(0, 100).map((row) => row[field]).filter(Boolean)
    const inferredType = inferColumnType(sampleValues)
    const hasNulls = data.some((row) => row[field] === '' || row[field] === null || row[field] === undefined)

    return {
      id: columnId,
      name: field,
      type: inferredType,
      nullable: hasNulls,
      duckDbName: columnId,
    }
  })

  const rows: TableRow[] = data.map((row, index) => {
    const rowId = `row_${index}`
    const rowData: TableRow = { __rowId: rowId }

    columns.forEach((col, colIndex) => {
      const field = fields[colIndex]
      let value: CellValue = row[field]

      if (col.type === 'number' && value !== '' && value !== null) {
        const num = parseFloat(String(value).replace(/,/g, ''))
        value = isNaN(num) ? value : num
      } else if (col.type === 'boolean') {
        const lower = String(value).toLowerCase()
        if (lower === 'true' || lower === '1' || lower === 'yes') value = true
        else if (lower === 'false' || lower === '0' || lower === 'no') value = false
      }

      rowData[col.id] = value
    })

    return rowData
  })

  const schema: TableSchema = {
    columns,
    rowCount: rows.length,
  }

  return { schema, rows }
}

export function inferColumnType(values: string[]): ColumnType {
  if (values.length === 0) return 'string'

  const types = values.map((v) => inferValueType(v))
  const counts: Record<string, number> = {}
  types.forEach((t) => {
    counts[t] = (counts[t] || 0) + 1
  })

  delete counts['null']

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return 'string'

  for (const [type, count] of Object.entries(counts)) {
    if (count / total > 0.8) {
      return type as ColumnType
    }
  }

  return 'string'
}
