import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { TableRow } from '@/state/dataStore'
import type { CellValue, ColumnSchema, ColumnType, TableSchema } from '@/types'
import { inferValueType } from '@/lib/utils'

export interface ParsedTableData {
  schema: TableSchema
  rows: TableRow[]
}

export async function parseFileData(
  fileData: ArrayBuffer,
  fileType: 'csv' | 'xlsx',
  sheetName?: string,
  schema?: TableSchema
): Promise<TableRow[]> {
  if (fileType === 'csv') {
    return (await parseCsvBuffer(fileData, schema)).rows
  }

  const workbook = readWorkbook(fileData)
  return parseWorkbookSheet(workbook, sheetName ?? workbook.SheetNames[0], schema).rows
}

export function parseCsvBuffer(
  fileData: ArrayBuffer,
  schema?: TableSchema,
): Promise<ParsedTableData> {
  const text = new TextDecoder('utf-8').decode(fileData)
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length > 0) {
          console.warn('CSV parsing warnings:', results.errors)
        }
        try {
          resolve(processTabularData(results.data, results.meta.fields ?? [], schema))
        } catch (error) {
          reject(error)
        }
      },
      error: reject,
    })
  })
}

export function readWorkbook(fileData: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(fileData, { type: 'array' })
}

export function parseWorkbookSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  schema?: TableSchema,
): ParsedTableData {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Worksheet "${sheetName}" was not found`)

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  if (data.length === 0) {
    if (schema) validateSourceHeaders(schema.columns, [])
    return {
      schema: schema ?? { columns: [], rowCount: 0 },
      rows: [],
    }
  }

  const headers = (data[0] as unknown[]).map((value, index) =>
    String(value || `Column ${index + 1}`),
  )
  const records = data.slice(1).map((row) => {
    const values = row as unknown[]
    return Object.fromEntries(
      headers.map((header, index) => [header, String(values[index] ?? '')]),
    )
  })

  return processTabularData(records, headers, schema)
}

function processTabularData(
  data: Record<string, string>[],
  fields: string[],
  existingSchema?: TableSchema,
): ParsedTableData {
  const columns = existingSchema?.columns ?? inferColumns(data, fields)
  validateSourceHeaders(columns, fields)
  const columnsByName = new Map(
    columns.map((column) => [column.sourceName ?? column.name, column]),
  )

  const rows = data.map((record, rowIndex) => {
    const row: TableRow = { __rowId: `row_${rowIndex}` }
    fields.forEach((field) => {
      const column = columnsByName.get(field)
      if (column) row[column.id] = coerceValue(record[field], column.type)
    })
    return row
  })

  return {
    schema: {
      ...existingSchema,
      columns,
      rowCount: rows.length,
    },
    rows,
  }
}

function validateSourceHeaders(columns: ColumnSchema[], fields: string[]): void {
  const availableHeaders = new Set(fields)
  const missingHeaders = [
    ...new Set(
      columns
        .map((column) => column.sourceName)
        .filter((sourceName): sourceName is string =>
          sourceName !== undefined && !availableHeaders.has(sourceName),
        ),
    ),
  ]
  if (missingHeaders.length === 0) return

  const available = fields.length > 0
    ? fields.map((field) => `"${field}"`).join(', ')
    : '(none)'
  throw new Error(
    `Source file headers changed. Missing persisted header${missingHeaders.length === 1 ? '' : 's'}: `
    + `${missingHeaders.map((header) => `"${header}"`).join(', ')}. Available headers: ${available}. `
    + 'Restore the missing header or re-import the source file.',
  )
}

function inferColumns(data: Record<string, string>[], fields: string[]): ColumnSchema[] {
  return fields.map((field, index) => ({
    id: `col_${index}_${field.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    name: field,
    sourceName: field,
    type: inferColumnType(
      data.slice(0, 100).map((row) => row[field]).filter(Boolean),
    ),
    nullable: data.some(
      (row) => row[field] === '' || row[field] === null || row[field] === undefined,
    ),
  }))
}

function inferColumnType(values: string[]): ColumnType {
  if (values.length === 0) return 'string'

  const counts = values.reduce<Record<string, number>>((result, value) => {
    const type = inferValueType(value)
    if (type !== 'null') result[type] = (result[type] ?? 0) + 1
    return result
  }, {})
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const match = Object.entries(counts).find(([, count]) => count / total > 0.8)
  return match ? match[0] as ColumnType : 'string'
}

function coerceValue(value: CellValue, type: ColumnType): CellValue {
  if (type === 'number' && value !== '' && value !== null) {
    const number = Number.parseFloat(String(value).replace(/,/g, ''))
    return Number.isNaN(number) ? value : number
  }
  if (type === 'boolean') {
    const normalized = String(value).toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    if (['false', '0', 'no'].includes(normalized)) return false
  }
  return value
}
