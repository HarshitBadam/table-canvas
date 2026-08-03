import { useState, useCallback, useRef, useEffect } from 'react'
import type { CellValue } from '@/types'
import type { ColumnSchema } from '@/types'
import { detectPattern, generateNextValues } from './autofill'
import type { GridRow, GridRowAccess } from './types'
import type { CellRangeSelection } from './useGridSelection'

interface UseGridAutofillOptions {
  isEditable: boolean
  columns: ColumnSchema[]
  rowAccess: GridRowAccess
  cellRangeSelection: CellRangeSelection | null
  getDisplayValue: (rowId: string, columnId: string, baseValue: CellValue, row?: GridRow) => CellValue
  saveSnapshot: (label: string) => void
  setCellValue: (tableId: string, rowId: string, columnId: string, value: CellValue) => void
  tableId: string
}

export function useGridAutofill({
  isEditable,
  columns,
  rowAccess,
  cellRangeSelection,
  getDisplayValue,
  saveSnapshot,
  setCellValue,
  tableId,
}: UseGridAutofillOptions) {
  const { getRowAtIndex } = rowAccess
  const [autofillDragging, setAutofillDragging] = useState(false)
  const [autofillEndRow, setAutofillEndRow] = useState<number | null>(null)
  const [autofillPreview, setAutofillPreview] = useState<{ rowIndex: number; value: CellValue }[]>([])
  const autofillColumnId = useRef<string | null>(null)
  const autofillSourceRange = useRef<{ startRow: number; endRow: number } | null>(null)

  const getAutofillSourceRange = useCallback((rowIndex: number, columnId: string): { startRow: number; endRow: number } => {
    if (cellRangeSelection) {
      const colIndex = columns.findIndex(c => c.id === columnId)
      if (colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
        return { startRow: cellRangeSelection.startRow, endRow: cellRangeSelection.endRow }
      }
    }
    return { startRow: rowIndex, endRow: rowIndex }
  }, [cellRangeSelection, columns])

  const collectSourceValues = useCallback((
    columnId: string,
    startRow: number,
    endRow: number,
  ): CellValue[] => {
    const sourceValues: CellValue[] = []
    for (let index = startRow; index <= endRow; index++) {
      const row = getRowAtIndex(index)
      if (row) {
        sourceValues.push(getDisplayValue(row.__rowId, columnId, row[columnId], row))
      }
    }
    return sourceValues
  }, [getDisplayValue, getRowAtIndex])

  const resetAutofillState = useCallback(() => {
    setAutofillDragging(false)
    setAutofillEndRow(null)
    setAutofillPreview([])
    autofillColumnId.current = null
    autofillSourceRange.current = null
  }, [])

  const handleAutofillStart = useCallback((rowIndex: number, columnId: string) => {
    if (!isEditable) return
    if (columns.find(column => column.id === columnId)?.isComputed) return
    const sourceRange = getAutofillSourceRange(rowIndex, columnId)
    setAutofillDragging(true)
    setAutofillEndRow(sourceRange.endRow)
    autofillColumnId.current = columnId
    autofillSourceRange.current = sourceRange
    setAutofillPreview([])
  }, [columns, isEditable, getAutofillSourceRange])

  const handleAutofillMove = useCallback((targetRowIndex: number) => {
    if (!autofillDragging || !autofillColumnId.current) return

    const columnId = autofillColumnId.current
    const sourceRange = autofillSourceRange.current
    if (!sourceRange) return
    const { startRow: sourceStartRow, endRow: sourceEndRow } = sourceRange

    if (targetRowIndex <= sourceEndRow) {
      setAutofillEndRow(sourceEndRow)
      setAutofillPreview([])
      return
    }

    setAutofillEndRow(targetRowIndex)

    const sourceValues = collectSourceValues(columnId, sourceStartRow, sourceEndRow)
    if (sourceValues.length === 0) return

    const previewValues = generateNextValues(detectPattern(sourceValues), targetRowIndex - sourceEndRow)
    setAutofillPreview(previewValues.map((value, idx) => ({
      rowIndex: sourceEndRow + idx + 1,
      value,
    })))
  }, [autofillDragging, collectSourceValues])

  const handleAutofillOneRow = useCallback((rowIndex: number, columnId: string) => {
    if (!isEditable) return

    const sourceRange = getAutofillSourceRange(rowIndex, columnId)
    const targetRow = getRowAtIndex(sourceRange.endRow + 1)
    if (!targetRow) return

    const sourceValues = collectSourceValues(columnId, sourceRange.startRow, sourceRange.endRow)
    if (sourceValues.length === 0) return

    const [nextValue] = generateNextValues(detectPattern(sourceValues), 1)
    saveSnapshot('Autofill')
    setCellValue(tableId, targetRow.__rowId, columnId, nextValue)
  }, [
    collectSourceValues,
    getAutofillSourceRange,
    isEditable,
    getRowAtIndex,
    saveSnapshot,
    setCellValue,
    tableId,
  ])

  const handleAutofillEnd = useCallback(() => {
    if (!autofillDragging || autofillEndRow === null || !autofillColumnId.current) {
      setAutofillDragging(false)
      setAutofillPreview([])
      return
    }

    const columnId = autofillColumnId.current
    const sourceRange = autofillSourceRange.current
    if (!sourceRange) {
      setAutofillDragging(false)
      setAutofillPreview([])
      return
    }

    const { startRow: sourceStartRow, endRow: sourceEndRow } = sourceRange
    const count = autofillEndRow - sourceEndRow
    if (count > 0) {
      const sourceValues = collectSourceValues(columnId, sourceStartRow, sourceEndRow)
      if (sourceValues.length > 0) {
        const newValues = generateNextValues(detectPattern(sourceValues), count)
        saveSnapshot('Autofill')
        newValues.forEach((value, idx) => {
          const targetRow = getRowAtIndex(sourceEndRow + idx + 1)
          if (targetRow) {
            setCellValue(tableId, targetRow.__rowId, columnId, value)
          }
        })
      }
    }

    resetAutofillState()
  }, [
    autofillDragging,
    autofillEndRow,
    collectSourceValues,
    getRowAtIndex,
    resetAutofillState,
    saveSnapshot,
    setCellValue,
    tableId,
  ])

  useEffect(() => {
    if (!autofillDragging) return

    const handleMouseUp = () => {
      handleAutofillEnd()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resetAutofillState()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', resetAutofillState)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', resetAutofillState)
    }
  }, [autofillDragging, handleAutofillEnd, resetAutofillState])

  return {
    autofillDragging,
    autofillEndRow,
    autofillPreview,
    autofillColumnId,
    handleAutofillStart,
    handleAutofillMove,
    handleAutofillOneRow,
  }
}
