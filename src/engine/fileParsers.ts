import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { TableRow } from '@/state/dataStore'
import type { CellValue, TableSchema, ColumnSchema } from '@/types'

export async function parseFileData(
  fileData: ArrayBuffer,
  fileType: 'csv' | 'xlsx',
  sheetName?: string,
  schema?: TableSchema
): Promise<TableRow[]> {
  if (fileType === 'csv') {
    return parseCSVData(fileData, schema)
  } else if (fileType === 'xlsx') {
    return parseExcelData(fileData, sheetName, schema)
  }

  return []
}

function parseCSVData(fileData: ArrayBuffer, schema?: TableSchema): Promise<TableRow[]> {
  return new Promise((resolve) => {
    const decoder = new TextDecoder('utf-8')
    const text = decoder.decode(fileData)

    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = convertToTableRows(results.data, results.meta.fields || [], schema)
        resolve(rows)
      },
      error: () => {
        resolve([])
      },
    })
  })
}

function parseExcelData(fileData: ArrayBuffer, sheetName?: string, schema?: TableSchema): Promise<TableRow[]> {
  return new Promise((resolve) => {
    try {
      const wb = XLSX.read(fileData, { type: 'array' })
      const targetSheet = sheetName || wb.SheetNames[0]
      const sheet = wb.Sheets[targetSheet]

      if (!sheet) {
        resolve([])
        return
      }

      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

      if (data.length === 0) {
        resolve([])
        return
      }

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

      const rows = convertToTableRows(dataRows, headers, schema)
      resolve(rows)
    } catch (error) {
      console.error('[MaterializationService] Excel parsing error:', error)
      resolve([])
    }
  })
}

/**
 * Convert parsed data to TableRow format with proper column IDs.
 * Maps raw column names to schema column IDs and performs type coercion.
 */
function convertToTableRows(
  data: Record<string, string>[],
  fields: string[],
  schema?: TableSchema
): TableRow[] {
  const columnIdMap = new Map<string, string>()

  if (schema?.columns) {
    schema.columns.forEach((col: ColumnSchema) => {
      columnIdMap.set(col.name, col.id)
    })
  } else {
    fields.forEach((field, index) => {
      const columnId = `col_${index}_${field.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      columnIdMap.set(field, columnId)
    })
  }

  return data.map((row, index) => {
    const rowId = `row_${index}`
    const rowData: TableRow = { __rowId: rowId }

    fields.forEach((field) => {
      const colId = columnIdMap.get(field) || field
      let value: CellValue = row[field]

      const colSchema = schema?.columns.find((c: ColumnSchema) => c.id === colId || c.name === field)

      if (colSchema?.type === 'number' && value !== '' && value !== null) {
        const num = parseFloat(String(value).replace(/,/g, ''))
        value = isNaN(num) ? value : num
      } else if (colSchema?.type === 'boolean') {
        const lower = String(value).toLowerCase()
        if (lower === 'true' || lower === '1' || lower === 'yes') value = true
        else if (lower === 'false' || lower === '0' || lower === 'no') value = false
      }

      rowData[colId] = value
    })

    return rowData
  })
}
