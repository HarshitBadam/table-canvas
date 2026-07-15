import type { ColumnSchema } from '@/types'
import type { CellRangeSelection } from './useGridSelection'

export interface CellPosition {
  rowIndex: number
  colIndex: number
}

export function getNavigationTarget(
  current: CellPosition,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter' | 'Tab',
  rowCount: number,
  columnCount: number,
  reverse = false,
): CellPosition {
  if (rowCount <= 0 || columnCount <= 0) return current

  let { rowIndex, colIndex } = current
  if (key === 'ArrowUp' || (key === 'Enter' && reverse)) rowIndex--
  else if (key === 'ArrowDown' || key === 'Enter') rowIndex++
  else if (key === 'ArrowLeft') colIndex--
  else if (key === 'ArrowRight') colIndex++
  else if (key === 'Tab') {
    colIndex += reverse ? -1 : 1
    if (colIndex >= columnCount) {
      colIndex = 0
      rowIndex++
    } else if (colIndex < 0) {
      colIndex = columnCount - 1
      rowIndex--
    }
  }

  return {
    rowIndex: Math.max(0, Math.min(rowCount - 1, rowIndex)),
    colIndex: Math.max(0, Math.min(columnCount - 1, colIndex)),
  }
}

export function getEditableCellsInSelection(
  selectedRow: number,
  selectedColIndex: number,
  range: CellRangeSelection | null,
  rows: { __rowId: string }[],
  columns: ColumnSchema[],
) {
  const bounds = range ?? {
    startRow: selectedRow,
    endRow: selectedRow,
    startColIndex: selectedColIndex,
    endColIndex: selectedColIndex,
  }

  const cells: { rowId: string; columnId: string }[] = []
  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex++) {
    const row = rows[rowIndex]
    if (!row) continue
    for (let colIndex = bounds.startColIndex; colIndex <= bounds.endColIndex; colIndex++) {
      const column = columns[colIndex]
      if (column && !column.isComputed) {
        cells.push({ rowId: row.__rowId, columnId: column.id })
      }
    }
  }
  return cells
}
