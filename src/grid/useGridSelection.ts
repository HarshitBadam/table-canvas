import { useState, useCallback, useRef, useEffect } from 'react'
import type { ColumnSchema } from '@/types'
import { useProjectStore } from '@/state/projectStore'
import type { SelectionType, GridRow } from './types'

export interface CellRangeSelection {
  startRow: number
  endRow: number
  startColIndex: number
  endColIndex: number
}

export function useGridSelection(
  tableId: string,
  columns: ColumnSchema[],
  rows: GridRow[],
  filteredRows: GridRow[],
  _isEditable: boolean,
) {
  const toggleCellHighlight = useProjectStore((state) => state.toggleCellHighlight)

  const [selection, setSelection] = useState<SelectionType>(null)
  const [cellRangeSelection, setCellRangeSelection] = useState<CellRangeSelection | null>(null)

  const isDraggingSelectionRef = useRef(false)
  const dragSelectionStart = useRef<{ rowIndex: number; colIndex: number } | null>(null)

  const selectedCell = selection?.type === 'cell' ? { rowIndex: selection.rowIndex, columnId: selection.columnId } : null
  const selectedColumn = selection?.type === 'column' ? selection.columnId : (selection?.type === 'cell' ? selection.columnId : null)
  const isHeaderRowSelected = selection?.type === 'header-row' || selection?.type === 'corner'
  const isIndexColumnSelected = selection?.type === 'index-column' || selection?.type === 'corner'
  const isCornerSelected = selection?.type === 'corner'

  const handleCellMouseDown = useCallback((rowIndex: number, columnId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return

    const colIndex = columns.findIndex(c => c.id === columnId)
    isDraggingSelectionRef.current = true
    dragSelectionStart.current = { rowIndex, colIndex }
    setSelection({ type: 'cell', rowIndex, columnId })
    setCellRangeSelection(null)
  }, [columns])

  const handleCellMouseEnter = useCallback((rowIndex: number, columnId: string) => {
    if (isDraggingSelectionRef.current && dragSelectionStart.current) {
      const colIndex = columns.findIndex(c => c.id === columnId)
      const startRow = Math.min(dragSelectionStart.current.rowIndex, rowIndex)
      const endRow = Math.max(dragSelectionStart.current.rowIndex, rowIndex)
      const startColIndex = Math.min(dragSelectionStart.current.colIndex, colIndex)
      const endColIndex = Math.max(dragSelectionStart.current.colIndex, colIndex)

      if (startRow !== endRow || startColIndex !== endColIndex) {
        setCellRangeSelection({ startRow, endRow, startColIndex, endColIndex })
      } else {
        setCellRangeSelection(null)
      }
    }
  }, [columns])

  const handleSelectionMouseUp = useCallback(() => {
    isDraggingSelectionRef.current = false
    dragSelectionStart.current = null
  }, [])

  const handleColumnClick = useCallback((columnId: string) => {
    setSelection({ type: 'column', columnId })
  }, [])

  const handleRowClick = useCallback((rowIndex: number) => {
    setSelection({ type: 'row', rowIndex })
  }, [])

  const handleCornerClick = useCallback(() => {
    setSelection({ type: 'corner' })
  }, [])

  const getRowInsertionIndex = useCallback((): number => {
    if (!selection) return rows.length
    switch (selection.type) {
      case 'cell':
        return selection.rowIndex + 1
      case 'row':
        return selection.rowIndex + 1
      case 'header-row':
      case 'corner':
        return 0
      case 'column':
      case 'index-column':
        return rows.length
      default:
        return rows.length
    }
  }, [selection, rows.length])

  const getColumnInsertionIndex = useCallback((): number => {
    if (!selection) return columns.length
    switch (selection.type) {
      case 'cell': {
        const cellColIdx = columns.findIndex(c => c.id === selection.columnId)
        return cellColIdx >= 0 ? cellColIdx + 1 : columns.length
      }
      case 'column': {
        const colIdx = columns.findIndex(c => c.id === selection.columnId)
        return colIdx >= 0 ? colIdx + 1 : columns.length
      }
      case 'index-column':
      case 'corner':
      case 'row':
        return 0
      case 'header-row':
        return columns.length
      default:
        return columns.length
    }
  }, [selection, columns])

  const getRowInsertionDescription = useCallback((): string => {
    if (!selection) return 'at end'
    switch (selection.type) {
      case 'cell':
        return `below row ${selection.rowIndex + 1}`
      case 'row':
        return `below row ${selection.rowIndex + 1}`
      case 'header-row':
      case 'corner':
        return 'at beginning'
      default:
        return 'at end'
    }
  }, [selection])

  const getColumnInsertionDescription = useCallback((): string => {
    if (!selection) return 'at end'
    const truncateName = (name: string, maxLen = 12) =>
      name.length > maxLen ? name.slice(0, maxLen) + '…' : name
    switch (selection.type) {
      case 'cell': {
        const cellCol = columns.find(c => c.id === selection.columnId)
        return cellCol ? `after ${truncateName(cellCol.name)}` : 'at end'
      }
      case 'column': {
        const col = columns.find(c => c.id === selection.columnId)
        return col ? `after ${truncateName(col.name)}` : 'at end'
      }
      case 'index-column':
      case 'corner':
      case 'row':
        return 'at beginning'
      default:
        return 'at end'
    }
  }, [selection, columns])

  const toggleHighlightForSelection = useCallback(() => {
    if (!filteredRows.length) return

    if (cellRangeSelection) {
      const { startRow, endRow, startColIndex, endColIndex } = cellRangeSelection
      for (let r = startRow; r <= endRow; r++) {
        const row = filteredRows[r]
        if (!row) continue
        for (let c = startColIndex; c <= endColIndex; c++) {
          const col = columns[c]
          if (!col) continue
          toggleCellHighlight(tableId, row.__rowId, col.id)
        }
      }
    } else if (selection?.type === 'cell') {
      const row = filteredRows[selection.rowIndex]
      if (row) {
        toggleCellHighlight(tableId, row.__rowId, selection.columnId)
      }
    }
  }, [cellRangeSelection, selection, filteredRows, columns, tableId, toggleCellHighlight])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        toggleHighlightForSelection()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleHighlightForSelection])

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDraggingSelectionRef.current) {
        handleSelectionMouseUp()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleSelectionMouseUp])

  return {
    selection,
    setSelection,
    selectedCell,
    selectedColumn,
    isHeaderRowSelected,
    isIndexColumnSelected,
    isCornerSelected,
    cellRangeSelection,
    setCellRangeSelection,
    isDraggingSelectionRef,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleColumnClick,
    handleRowClick,
    handleCornerClick,
    getRowInsertionIndex,
    getColumnInsertionIndex,
    getRowInsertionDescription,
    getColumnInsertionDescription,
    toggleHighlightForSelection,
  }
}
