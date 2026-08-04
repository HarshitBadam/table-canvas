import type { WorkBook } from 'xlsx'
import { readFileAsArrayBuffer } from '@/lib/utils'
import {
  parseCsvFile,
  parseWorkbookSheet,
  readWorkbook,
  type CsvParseOptions,
  type ParsedTableData,
} from '@/engine/parsing/fileParsers'
import { uploadFileWithSync } from '@/persistence/sync/session/syncService'
import type { UploadFileSyncOptions } from '../../sync/files/fileSync'

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface SheetInfo {
  name: string
  rowCount: number
  selected: boolean
}

export async function inspectCSVFile(
  file: File,
  options?: CsvParseOptions,
): Promise<ParsedTableData> {
  return parseCsvFile(file, undefined, options)
}

function sheetInfosFromWorkbook(workbook: WorkBook): SheetInfo[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const range = sheet['!ref']?.split(':') ?? []
    const rowCount = range.length === 2
      ? Number.parseInt(range[1].match(/\d+$/)?.[0] ?? '1', 10) - 1
      : 0
    return { name, rowCount, selected: true }
  })
}

export async function inspectExcelFile(file: File): Promise<{
  workbook: WorkBook
  buffer: ArrayBuffer
  sheets: SheetInfo[]
}> {
  const buffer = await readFileAsArrayBuffer(file)
  const workbook = readWorkbook(buffer)
  return { workbook, buffer, sheets: sheetInfosFromWorkbook(workbook) }
}

export async function importSheetAndPersist(
  workbook: WorkBook,
  sheetName: string,
  fileName: string,
  projectId: string,
  fileBuffer?: ArrayBuffer,
  options?: UploadFileSyncOptions,
): Promise<{ tableData: ParsedTableData; fileRef: string }> {
  const tableData = parseWorkbookSheet(workbook, sheetName)
  if (!fileBuffer) throw new Error('The workbook data is unavailable')
  const file = new File([fileBuffer], fileName, { type: EXCEL_MIME_TYPE })
  const uploaded = await uploadFileWithSync(file, projectId, undefined, options)
  return { tableData, fileRef: uploaded.id }
}
