import { getRawTableData, getTableData } from './tableDataService'
import type { TableRow } from '@/state/dataStore'

const DEFAULT_PAGE_SIZE = 50_000

export async function readAllTableRows(
  tableId: string,
  options: { pageSize?: number; raw?: boolean } = {},
): Promise<TableRow[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const raw = options.raw ?? false
  const readPage = raw ? getRawTableData : getTableData
  const firstPage = await readPage(tableId, 0, pageSize)
  if (firstPage.error) throw new Error(firstPage.error)

  const expectedTotal = firstPage.totalRows
  const rows = [...firstPage.rows]
  while (rows.length < expectedTotal) {
    const page = await readPage(
      tableId,
      rows.length,
      Math.min(pageSize, expectedTotal - rows.length),
    )
    if (page.error) throw new Error(page.error)
    if (page.totalRows !== expectedTotal) {
      throw new Error('The table changed while it was being copied. Please try again.')
    }
    if (page.rows.length === 0) {
      throw new Error(
        `Only ${rows.length.toLocaleString()} of ${expectedTotal.toLocaleString()} rows could be read`,
      )
    }
    rows.push(...page.rows)
  }
  return rows
}
