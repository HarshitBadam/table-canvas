import type { CellValue, ColumnSchema } from '@/types'
import { evaluateComputedColumns } from '@/formula'
import type { TableRow } from '@/state/dataStore'

/**
 * Resolves the display value for a cell by applying pending patches first,
 * then evaluating formula columns using the patched row data.
 *
 * Shared between GridView (useGridData) and the canvas MiniTableView.
 */
export function computeDisplayValue(
  rowId: string,
  columnId: string,
  baseValue: CellValue,
  row: TableRow | undefined,
  columns: ColumnSchema[],
  cellPatches?: Record<string, Record<string, CellValue>>
): CellValue {
  if (cellPatches?.[columnId]?.[rowId] !== undefined) {
    return cellPatches[columnId][rowId]
  }

  const column = columns.find(c => c.id === columnId)
  if (column?.formula && column.isComputed && row) {
    const patchedRow: Record<string, CellValue> = { ...row }
    if (patchedRow[columnId] === undefined) patchedRow[columnId] = baseValue
    for (const candidate of columns) {
      const patch = cellPatches?.[candidate.id]?.[rowId]
      if (patch !== undefined) patchedRow[candidate.id] = patch
    }

    const result = evaluateComputedColumns([patchedRow], columns)
    if (result.errors.some(error => error.columnId === columnId)) return '#ERROR'
    return result.rows[0]?.[columnId] ?? null
  }

  return baseValue
}
