import type { WorkBook } from 'xlsx'
import type { TableSchema } from '@/types'
import type { TableRow } from '@/state/dataStore'
import { readFileAsArrayBuffer } from '@/lib/utils'
import { getEngine } from '@/engine'
import { computePatchesVersion, computeSourceVersionHash } from '@/engine/cacheUtils'
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

export async function loadTableIntoEngine(
  tableId: string,
  schema: TableSchema,
  rows: TableRow[],
): Promise<boolean> {
  try {
    const engine = getEngine()
    await engine.init()

    const node = useProjectStore.getState().getTableNode(tableId)
    const patches = useProjectStore.getState().patches[tableId]
    await engine.loadTable(tableId, schema, rows, patches)
    const fileRef = node?.kind === 'source_table' ? node.plan.fileRef : undefined
    const currentVersionHash = computeSourceVersionHash(
      tableId,
      fileRef ?? '',
      computePatchesVersion(patches),
    )

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
