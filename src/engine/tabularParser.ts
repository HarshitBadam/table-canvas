import Papa from 'papaparse'
import type { TableRow } from '@/state/dataStore'
import type { CellValue, ColumnSchema, ColumnType, TableSchema } from '@/types'
import { inferValueType } from '@/lib/utils'

export interface ParsedTableData {
  schema: TableSchema
  rows: TableRow[]
}

/** Yield to the browser between CSV chunks so import UI can paint immediately. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout === 'function') setTimeout(resolve, 0)
    else resolve()
  })
}

export function parseCsvData(
  fileData: ArrayBuffer,
  existingSchema?: TableSchema,
): Promise<ParsedTableData> {
  const text = new TextDecoder('utf-8').decode(fileData)

  return new Promise((resolve, reject) => {
    const rows: TableRow[] = []
    const samples: Record<string, string>[] = []
    const pendingRows: Record<string, string>[] = []
    let fields: string[] = []
    let columns = existingSchema?.columns
    let columnsByName: Map<string, ColumnSchema> | undefined
    let parseError: unknown
    let settling = false

    const prepareColumns = () => {
      if (columnsByName) return
      columns ??= inferColumns(samples, fields)
      validateSourceHeaders(columns, fields)
      columnsByName = new Map(
        columns.map((column) => [column.sourceName ?? column.name, column]),
      )
    }

    const appendRows = (records: Record<string, string>[]) => {
      prepareColumns()
      for (const record of records) {
        const row: TableRow = { __rowId: `row_${rows.length}` }
        for (const field of fields) {
          const column = columnsByName!.get(field)
          if (column) row[column.id] = coerceValue(record[field], column.type)
        }
        rows.push(row)
      }
    }

    try {
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        chunk: (results: Papa.ParseResult<Record<string, string>>, parser: Papa.Parser) => {
          if (settling) return
          try {
            fields = results.meta.fields ?? fields
            if (!columns && samples.length < 100) {
              const needed = 100 - samples.length
              samples.push(...results.data.slice(0, needed))
              pendingRows.push(...results.data)
              if (samples.length >= 100) {
                appendRows(pendingRows)
                pendingRows.length = 0
              }
            } else {
              appendRows(results.data)
            }
          } catch (error) {
            parseError = error
            parser.abort()
            return
          }
          parser.pause()
          settling = true
          void yieldToUi().then(() => {
            settling = false
            parser.resume()
          })
        },
        complete: (results) => {
          if (parseError) {
            reject(parseError)
            return
          }
          if (results.errors?.length > 0) {
            console.warn('CSV parsing warnings:', results.errors)
          }
          try {
            if (pendingRows.length > 0) appendRows(pendingRows)
            else prepareColumns()
            resolve({
              schema: {
                ...existingSchema,
                columns: columns!,
                rowCount: rows.length,
              },
              rows,
            })
          } catch (error) {
            reject(error)
          }
        },
        error: reject,
      })
    } catch (error) {
      reject(error)
    }
  })
}

export function processTabularData(
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
