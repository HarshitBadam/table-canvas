import type { WorkBook } from 'xlsx'
import { readFileAsArrayBuffer } from '@/lib/utils'
import {
  parseCsvBuffer,
  parseWorkbookSheet,
  readWorkbook,
  type ParsedTableData,
} from '@/engine/fileParsers'
import { useProjectStore } from '@/state/projectStore'
import { uploadFileWithSync } from '@/persistence/syncService'

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface SheetInfo {
  name: string
  rowCount: number
  selected: boolean
}

interface CSVParseResult extends ParsedTableData {
  fileRef: string
}

interface ExcelMultiSheet {
  kind: 'multi'
  workbook: WorkBook
  buffer: ArrayBuffer
  sheets: SheetInfo[]
}

interface ExcelSingleSheet {
  kind: 'single'
  tableData: ParsedTableData
  fileRef: string
}

type ExcelParseResult = ExcelMultiSheet | ExcelSingleSheet

export async function parseCSVFile(file: File): Promise<CSVParseResult> {
  const buffer = await readFileAsArrayBuffer(file)
  const tableData = await parseCsvBuffer(buffer)
  const uploaded = await uploadFileWithSync(file, useProjectStore.getState().projectId)
  return { ...tableData, fileRef: uploaded.id }
}

export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
  const buffer = await readFileAsArrayBuffer(file)
  const workbook = readWorkbook(buffer)

  if (workbook.SheetNames.length === 1) {
    const tableData = parseWorkbookSheet(workbook, workbook.SheetNames[0])
    const uploaded = await uploadFileWithSync(file, useProjectStore.getState().projectId)
    return { kind: 'single', tableData, fileRef: uploaded.id }
  }

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const range = sheet['!ref']?.split(':') ?? []
    const rowCount = range.length === 2
      ? Number.parseInt(range[1].match(/\d+$/)?.[0] ?? '1', 10) - 1
      : 0
    return { name, rowCount, selected: true }
  })

  return { kind: 'multi', workbook, buffer, sheets }
}

export async function importSheetAndPersist(
  workbook: WorkBook,
  sheetName: string,
  fileName: string,
  fileBuffer?: ArrayBuffer,
): Promise<{ tableData: ParsedTableData; fileRef: string }> {
  const tableData = parseWorkbookSheet(workbook, sheetName)
  if (!fileBuffer) throw new Error('The workbook data is unavailable')
  const file = new File([fileBuffer], fileName, { type: EXCEL_MIME_TYPE })
  const uploaded = await uploadFileWithSync(file, useProjectStore.getState().projectId)
  return { tableData, fileRef: uploaded.id }
}
