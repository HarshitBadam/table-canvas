import type { WorkBook } from 'xlsx'
import type { TableSchema } from '@/types'
import type { TableRow } from '@/state/dataStore'
import { generateId, readFileAsArrayBuffer } from '@/lib/utils'
import { getEngine } from '@/engine'
import { computeSourceVersionHash } from '@/engine/cacheUtils'
import {
  parseCsvBuffer,
  parseWorkbookSheet,
  readWorkbook,
  type ParsedTableData,
} from '@/engine/fileParsers'
import { useProjectStore } from '@/state/projectStore'
import { saveFile } from '@/persistence/db'

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

export async function loadTableIntoEngine(
  tableId: string,
  schema: TableSchema,
  rows: TableRow[],
): Promise<boolean> {
  try {
    const engine = getEngine()
    await engine.init()
    await engine.loadTable(tableId, schema, rows)

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
  const buffer = await readFileAsArrayBuffer(file)
  const tableData = await parseCsvBuffer(buffer)
  const fileRef = generateId()
  await saveFile(fileRef, file.name, file.type || 'text/csv', buffer)
  return { ...tableData, fileRef }
}

export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
  const buffer = await readFileAsArrayBuffer(file)
  const workbook = readWorkbook(buffer)

  if (workbook.SheetNames.length === 1) {
    const tableData = parseWorkbookSheet(workbook, workbook.SheetNames[0])
    const fileRef = generateId()
    await saveFile(fileRef, file.name, EXCEL_MIME_TYPE, buffer)
    return { kind: 'single', tableData, fileRef }
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
  const fileRef = generateId()
  if (fileBuffer) {
    await saveFile(fileRef, fileName, EXCEL_MIME_TYPE, fileBuffer)
  }
  return { tableData, fileRef }
}
