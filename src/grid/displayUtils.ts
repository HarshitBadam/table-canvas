import type { CellValue, ColumnSchema } from '@/types'
import { evaluateFormula, FormulaValue } from '@/formula'
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
    const rowData: Record<string, FormulaValue> = {}
    columns.forEach(col => {
      if (!col.isComputed) {
        const val = cellPatches?.[col.id]?.[rowId] ?? row[col.id]
        rowData[col.id] = val as FormulaValue
      }
    })

    const columnInfo = columns
      .filter(c => !c.isComputed)
      .map(c => ({ id: c.id, name: c.name, type: c.type }))

    const result = evaluateFormula(column.formula, {
      row: rowData,
      columns: columnInfo,
    })

    if (result.success) {
      return result.value as CellValue
    }
    return '#ERROR'
  }

  return baseValue
}
