import { getTableData } from '@/engine/tableDataService'
import type { TableRow } from '@/state/dataStore'

const MAX_IN_MEMORY_CLEANING_ROWS = 100_000

export async function loadCleaningRows(tableId: string): Promise<TableRow[]> {
  const firstPage = await getTableData(tableId, 0, 10_000)
  if (firstPage.error) throw new Error(firstPage.error)
  if (firstPage.totalRows > MAX_IN_MEMORY_CLEANING_ROWS) {
    throw new Error(
      `This table has ${firstPage.totalRows.toLocaleString()} rows. In-place cleaning is limited to ${MAX_IN_MEMORY_CLEANING_ROWS.toLocaleString()} rows to protect browser memory.`,
    )
  }
  if (firstPage.totalRows <= firstPage.rows.length) return firstPage.rows

  const fullResult = await getTableData(tableId, 0, firstPage.totalRows)
  if (fullResult.error) throw new Error(fullResult.error)
  return fullResult.rows
}
