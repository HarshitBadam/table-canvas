import { useCallback } from 'react'
import type { CellValue, ColumnSchema } from '@/types'
import type { GridClipboardData } from './types'
import type { GridRow, GridRowAccess, SelectionType } from './types'
import type { CellRangeSelection } from './useGridSelection'

export function useGridClipboard(
  tableId: string,
  node: { name: string } | null | undefined,
  columns: ColumnSchema[],
  rowAccess: GridRowAccess,
  getDisplayValue: (rowId: string, columnId: string, baseValue: CellValue, row?: GridRow) => CellValue,
  selection: SelectionType,
  cellRangeSelection: CellRangeSelection | null,
) {
  const { getRowAtIndex } = rowAccess
  const getSelectedCellData = useCallback((): GridClipboardData | null => {
    if (!node) return null

    let range: { startRow: number; endRow: number; startColIndex: number; endColIndex: number }

    if (cellRangeSelection) {
      range = cellRangeSelection
    } else if (selection?.type === 'cell') {
      const colIndex = columns.findIndex(c => c.id === selection.columnId)
      if (colIndex < 0) return null
      range = {
        startRow: selection.rowIndex,
        endRow: selection.rowIndex,
        startColIndex: colIndex,
        endColIndex: colIndex,
      }
    } else {
      return null
    }

    const selectedCols = columns.slice(range.startColIndex, range.endColIndex + 1)
    const headers = selectedCols.map(c => c.name)
    const columnIds = selectedCols.map(c => c.id)
    const dataRows: CellValue[][] = []
    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex++) {
      const row = getRowAtIndex(rowIndex)
      if (!row) return null
      dataRows.push(selectedCols.map(col =>
        getDisplayValue(row.__rowId, col.id, row[col.id], row)
      ))
    }

    return {
      headers,
      columnIds,
      rows: dataRows,
      sourceTableId: tableId,
      sourceTableName: node.name,
      timestamp: Date.now(),
    }
  }, [cellRangeSelection, selection, columns, getRowAtIndex, getDisplayValue, tableId, node])

  const formatClipboardText = useCallback((data: GridClipboardData): string => {
    return data.rows.map(row =>
      row.map(cell => cell === null || cell === undefined ? '' : String(cell)).join('\t')
    ).join('\n')
  }, [])

  return {
    getSelectedCellData,
    formatClipboardText,
  }
}
