import * as XLSX from 'xlsx'
import type { TableRow } from '@/state/dataStore'
import type { TableSchema } from '@/types'
import { parseTableSnapshot } from './tableSnapshot'
import {
  type CsvParseOptions,
  parseCsvData,
  parseCsvFile as parseCsvFileData,
  processTabularData,
  type ParsedTableData,
} from './tabularParser'

export type { ParsedTableData, CsvParseOptions }
export { processTabularData }

export async function parseFileData(
  fileData: ArrayBuffer,
  fileType: 'csv' | 'xlsx' | 'snapshot',
  sheetName?: string,
  schema?: TableSchema
): Promise<TableRow[]> {
  if (fileType === 'csv') {
    return (await parseCsvBuffer(fileData, schema)).rows
  }
  if (fileType === 'snapshot') {
    return parseTableSnapshot(fileData, schema)
  }

  const workbook = readWorkbook(fileData)
  return parseWorkbookSheet(workbook, sheetName ?? workbook.SheetNames[0], schema).rows
}

export function parseCsvBuffer(
  fileData: ArrayBuffer,
  schema?: TableSchema,
  options?: CsvParseOptions,
): Promise<ParsedTableData> {
  return parseCsvData(fileData, schema, options)
}

/** Parse a browser File progressively without first copying it into a buffer. */
export function parseCsvFile(
  file: File,
  schema?: TableSchema,
  options?: CsvParseOptions,
): Promise<ParsedTableData> {
  return parseCsvFileData(file, schema, options)
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
    // Preserve header validation for rematerialization of empty sheets.
    return processTabularData([], schema?.columns.map(column => column.sourceName ?? column.name) ?? [], schema)
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
