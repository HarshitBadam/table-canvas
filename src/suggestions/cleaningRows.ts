import { getTableData } from '@/engine/tableDataService'
import type { TableRow } from '@/state/dataStore'

export const CLEANING_PREVIEW_ROWS = 1_000

export interface CleaningPreview {
  rows: TableRow[]
  totalRows: number
  isTruncated: boolean
}

export async function loadCleaningPreview(tableId: string): Promise<CleaningPreview> {
  const result = await getTableData(tableId, 0, CLEANING_PREVIEW_ROWS)
  if (result.error) throw new Error(result.error)
  return {
    rows: result.rows,
    totalRows: result.totalRows,
    isTruncated: result.totalRows > result.rows.length,
  }
}

export async function loadCleaningRows(
  tableId: string,
  knownTotalRows?: number,
): Promise<TableRow[]> {
  let totalRows = knownTotalRows
  if (totalRows === undefined) {
    const preflight = await getTableData(tableId, 0, 0)
    if (preflight.error) throw new Error(preflight.error)
    totalRows = preflight.totalRows
  }

  if (totalRows === 0) return []

  const fullResult = await getTableData(tableId, 0, totalRows)
  if (fullResult.error) throw new Error(fullResult.error)
  return fullResult.rows
}
