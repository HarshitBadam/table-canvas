/**
 * useGridAutofill
 * 
 * Manages autofill (drag-to-fill) state and pattern detection for the grid.
 * Supports filling cells with patterns detected from source values.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { CellValue, ColumnSchema } from '@/lib/types'
import { detectPattern, generateNextValues } from '../autofill'
import type { CellRangeSelection } from './useGridSelection'

export interface AutofillPreview {
  rowIndex: number
  value: CellValue
}

export interface UseGridAutofillReturn {
  // State
  autofillDragging: boolean
  autofillEndRow: number | null
  autofillPreview: AutofillPreview[]
  autofillColumnId: string | null
  
  // Actions
  handleAutofillStart: (rowIndex: number, columnId: string) => void
  handleAutofillMove: (targetRowIndex: number) => void
  handleAutofillEnd: () => { columnId: string; values: { rowIndex: number; value: CellValue }[] } | null
  resetAutofill: () => void
  
  // Helpers
  getAutofillSourceRange: (
    rowIndex: number, 
    columnId: string, 
    cellRangeSelection: CellRangeSelection | null,
    columns: ColumnSchema[]
  ) => { startRow: number; endRow: number }
  isInAutofillRange: (rowIndex: number, columnId: string, sourceEndRow: number | null) => boolean
}

interface AutofillContext {
  columns: ColumnSchema[]
  rows: Array<{ __rowId: string; [key: string]: CellValue }>
  cellRangeSelection: CellRangeSelection | null
  selectedCell: { rowIndex: number; columnId: string } | null
  getDisplayValue: (rowId: string, columnId: string, baseValue: CellValue, row?: Record<string, CellValue>) => CellValue
}

export function useGridAutofill(context: AutofillContext): UseGridAutofillReturn {
  const { columns, rows, cellRangeSelection, selectedCell, getDisplayValue } = context
  
  // Autofill state
  const [autofillDragging, setAutofillDragging] = useState(false)
  const [autofillEndRow, setAutofillEndRow] = useState<number | null>(null)
  const [autofillPreview, setAutofillPreview] = useState<AutofillPreview[]>([])
  const autofillColumnIdRef = useRef<string | null>(null)

  // Get the autofill source range (either from range selection or single cell)
  const getAutofillSourceRange = useCallback((
    rowIndex: number, 
    columnId: string,
    rangeSelection: CellRangeSelection | null,
    cols: ColumnSchema[]
  ): { startRow: number; endRow: number } => {
    // If we have a range selection that includes this column, use that
    if (rangeSelection) {
      const colIndex = cols.findIndex(c => c.id === columnId)
      if (colIndex >= rangeSelection.startColIndex && colIndex <= rangeSelection.endColIndex) {
        return { startRow: rangeSelection.startRow, endRow: rangeSelection.endRow }
      }
    }
    // Otherwise use single cell
    return { startRow: rowIndex, endRow: rowIndex }
  }, [])

  // Start autofill dragging
  const handleAutofillStart = useCallback((rowIndex: number, columnId: string) => {
    const sourceRange = getAutofillSourceRange(rowIndex, columnId, cellRangeSelection, columns)
    setAutofillDragging(true)
    setAutofillEndRow(sourceRange.endRow)
    autofillColumnIdRef.current = columnId
    setAutofillPreview([])
  }, [cellRangeSelection, columns, getAutofillSourceRange])

  // Update while dragging
  const handleAutofillMove = useCallback((targetRowIndex: number) => {
    if (!autofillDragging || !autofillColumnIdRef.current) return
    
    const columnId = autofillColumnIdRef.current
    
    // Get source range
    let sourceStartRow: number
    let sourceEndRow: number
    
    const colIndex = columns.findIndex(c => c.id === columnId)
    if (cellRangeSelection && colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
      sourceStartRow = cellRangeSelection.startRow
      sourceEndRow = cellRangeSelection.endRow
    } else if (selectedCell && selectedCell.columnId === columnId) {
      sourceStartRow = selectedCell.rowIndex
      sourceEndRow = selectedCell.rowIndex
    } else {
      return
    }
    
    // Only allow dragging downward from the end of the selection
    if (targetRowIndex <= sourceEndRow) {
      setAutofillEndRow(sourceEndRow)
      setAutofillPreview([])
      return
    }

    setAutofillEndRow(targetRowIndex)

    // Get all source values from the range
    const sourceValues: CellValue[] = []
    for (let i = sourceStartRow; i <= sourceEndRow; i++) {
      const row = rows[i]
      if (row) {
        const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
        sourceValues.push(value)
      }
    }

    if (sourceValues.length === 0) return

    // Detect pattern from ALL source values
    const pattern = detectPattern(sourceValues)
    
    // Generate preview values for ALL cells being filled
    const count = targetRowIndex - sourceEndRow
    const previewValues = generateNextValues(pattern, count)

    // Create preview entries
    const preview = previewValues.map((value, idx) => ({
      rowIndex: sourceEndRow + idx + 1,
      value,
    }))

    setAutofillPreview(preview)
  }, [autofillDragging, cellRangeSelection, selectedCell, columns, rows, getDisplayValue])

  // Reset autofill state
  const resetAutofill = useCallback(() => {
    setAutofillDragging(false)
    setAutofillEndRow(null)
    setAutofillPreview([])
    autofillColumnIdRef.current = null
  }, [])

  // End dragging and return values to apply
  const handleAutofillEnd = useCallback((): { columnId: string; values: { rowIndex: number; value: CellValue }[] } | null => {
    if (!autofillDragging || autofillEndRow === null || !autofillColumnIdRef.current) {
      resetAutofill()
      return null
    }

    const columnId = autofillColumnIdRef.current
    
    // Get source range
    let sourceStartRow: number
    let sourceEndRow: number
    
    const colIndex = columns.findIndex(c => c.id === columnId)
    if (cellRangeSelection && colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
      sourceStartRow = cellRangeSelection.startRow
      sourceEndRow = cellRangeSelection.endRow
    } else if (selectedCell && selectedCell.columnId === columnId) {
      sourceStartRow = selectedCell.rowIndex
      sourceEndRow = selectedCell.rowIndex
    } else {
      resetAutofill()
      return null
    }

    const count = autofillEndRow - sourceEndRow

    if (count <= 0) {
      resetAutofill()
      return null
    }

    // Get all source values from the range
    const sourceValues: CellValue[] = []
    for (let i = sourceStartRow; i <= sourceEndRow; i++) {
      const row = rows[i]
      if (row) {
        const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
        sourceValues.push(value)
      }
    }

    if (sourceValues.length === 0) {
      resetAutofill()
      return null
    }

    const pattern = detectPattern(sourceValues)
    const newValues = generateNextValues(pattern, count)

    // Build result with row indices
    const result = newValues.map((value, idx) => ({
      rowIndex: sourceEndRow + idx + 1,
      value,
    }))

    // Reset state
    resetAutofill()

    return { columnId, values: result }
  }, [autofillDragging, autofillEndRow, cellRangeSelection, selectedCell, columns, rows, getDisplayValue, resetAutofill])

  // Check if a cell is in the autofill range
  const isInAutofillRange = useCallback((
    rowIndex: number, 
    columnId: string, 
    sourceEndRow: number | null
  ): boolean => {
    return (
      autofillDragging && 
      sourceEndRow !== null && 
      autofillEndRow !== null &&
      autofillColumnIdRef.current === columnId &&
      rowIndex > sourceEndRow && 
      rowIndex <= autofillEndRow
    )
  }, [autofillDragging, autofillEndRow])

  // Global mouse up handler
  useEffect(() => {
    if (!autofillDragging) return

    const handleMouseUp = () => {
      // Note: The actual autofill application should be handled by the parent
      // This just resets the dragging state if not explicitly ended
      if (autofillDragging) {
        resetAutofill()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [autofillDragging, resetAutofill])

  return {
    autofillDragging,
    autofillEndRow,
    autofillPreview,
    autofillColumnId: autofillColumnIdRef.current,
    handleAutofillStart,
    handleAutofillMove,
    handleAutofillEnd,
    resetAutofill,
    getAutofillSourceRange,
    isInAutofillRange,
  }
}
