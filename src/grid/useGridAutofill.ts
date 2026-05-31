import { useState, useCallback, useRef, useEffect } from 'react'
import type { CellValue } from '@/types'
import type { ColumnSchema } from '@/types'
import { detectPattern, generateNextValues } from './autofill'
import type { GridRow, SelectionType } from './types'
import type { CellRangeSelection } from './useGridSelection'

interface UseGridAutofillOptions {
  isEditable: boolean
  columns: ColumnSchema[]
  rows: GridRow[]
  selection: SelectionType
  cellRangeSelection: CellRangeSelection | null
  getDisplayValue: (rowId: string, columnId: string, baseValue: CellValue, row?: GridRow) => CellValue
  saveSnapshot: (label: string) => void
  setCellValue: (tableId: string, rowId: string, columnId: string, value: CellValue) => void
  tableId: string
}

export function useGridAutofill({
  isEditable,
  columns,
  rows,
  selection,
  cellRangeSelection,
  getDisplayValue,
  saveSnapshot,
  setCellValue,
  tableId,
}: UseGridAutofillOptions) {
  const [autofillDragging, setAutofillDragging] = useState(false)
  const [autofillEndRow, setAutofillEndRow] = useState<number | null>(null)
  const [autofillPreview, setAutofillPreview] = useState<{ rowIndex: number; value: CellValue }[]>([])
  const autofillColumnId = useRef<string | null>(null)

  const getAutofillSourceRange = useCallback((rowIndex: number, columnId: string): { startRow: number; endRow: number } => {
    if (cellRangeSelection) {
      const colIndex = columns.findIndex(c => c.id === columnId)
      if (colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
        return { startRow: cellRangeSelection.startRow, endRow: cellRangeSelection.endRow }
      }
    }
    return { startRow: rowIndex, endRow: rowIndex }
  }, [cellRangeSelection, columns])

  const handleAutofillStart = useCallback((rowIndex: number, columnId: string) => {
    if (!isEditable) return
    const sourceRange = getAutofillSourceRange(rowIndex, columnId)
    setAutofillDragging(true)
    setAutofillEndRow(sourceRange.endRow)
    autofillColumnId.current = columnId
    setAutofillPreview([])
  }, [isEditable, getAutofillSourceRange])

  const handleAutofillMove = useCallback((targetRowIndex: number) => {
    if (!autofillDragging || !autofillColumnId.current) return

    const columnId = autofillColumnId.current

    let sourceStartRow: number
    let sourceEndRow: number

    const colIndex = columns.findIndex(c => c.id === columnId)
    if (cellRangeSelection && colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
      sourceStartRow = cellRangeSelection.startRow
      sourceEndRow = cellRangeSelection.endRow
    } else if (selection?.type === 'cell' && selection.columnId === columnId) {
      sourceStartRow = selection.rowIndex
      sourceEndRow = selection.rowIndex
    } else {
      return
    }

    if (targetRowIndex <= sourceEndRow) {
      setAutofillEndRow(sourceEndRow)
      setAutofillPreview([])
      return
    }

    setAutofillEndRow(targetRowIndex)

    const sourceValues: CellValue[] = []
    for (let i = sourceStartRow; i <= sourceEndRow; i++) {
      const row = rows[i]
      if (row) {
        const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
        sourceValues.push(value)
      }
    }

    if (sourceValues.length === 0) return

    const pattern = detectPattern(sourceValues)
    const count = targetRowIndex - sourceEndRow
    const previewValues = generateNextValues(pattern, count)

    const preview = previewValues.map((value, idx) => ({
      rowIndex: sourceEndRow + idx + 1,
      value,
    }))

    setAutofillPreview(preview)
  }, [autofillDragging, cellRangeSelection, selection, rows, getDisplayValue, columns])

  const handleAutofillEnd = useCallback(() => {
    if (!autofillDragging || autofillEndRow === null || !autofillColumnId.current) {
      setAutofillDragging(false)
      setAutofillPreview([])
      return
    }

    const columnId = autofillColumnId.current

    let sourceStartRow: number
    let sourceEndRow: number

    const colIndex = columns.findIndex(c => c.id === columnId)
    if (cellRangeSelection && colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
      sourceStartRow = cellRangeSelection.startRow
      sourceEndRow = cellRangeSelection.endRow
    } else if (selection?.type === 'cell' && selection.columnId === columnId) {
      sourceStartRow = selection.rowIndex
      sourceEndRow = selection.rowIndex
    } else {
      setAutofillDragging(false)
      setAutofillPreview([])
      return
    }

    const count = autofillEndRow - sourceEndRow

    if (count > 0) {
      const sourceValues: CellValue[] = []
      for (let i = sourceStartRow; i <= sourceEndRow; i++) {
        const row = rows[i]
        if (row) {
          const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
          sourceValues.push(value)
        }
      }

      if (sourceValues.length > 0) {
        const pattern = detectPattern(sourceValues)
        const newValues = generateNextValues(pattern, count)

        saveSnapshot('Autofill')
        newValues.forEach((value, idx) => {
          const targetRow = rows[sourceEndRow + idx + 1]
          if (targetRow) {
            setCellValue(tableId, targetRow.__rowId, columnId, value)
          }
        })
      }
    }

    setAutofillDragging(false)
    setAutofillEndRow(null)
    setAutofillPreview([])
    autofillColumnId.current = null
  }, [autofillDragging, autofillEndRow, cellRangeSelection, selection, rows, getDisplayValue, saveSnapshot, setCellValue, tableId, columns])

  useEffect(() => {
    if (!autofillDragging) return

    const handleMouseUp = () => {
      handleAutofillEnd()
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [autofillDragging, handleAutofillEnd])

  return {
    autofillDragging,
    autofillEndRow,
    autofillPreview,
    autofillColumnId,
    handleAutofillStart,
    handleAutofillMove,
    handleAutofillEnd,
  }
}
