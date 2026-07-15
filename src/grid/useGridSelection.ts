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
  const rangeAnchorRef = useRef<{ rowIndex: number; colIndex: number } | null>(null)
  const pendingDragRangeRef = useRef<CellRangeSelection | null>(null)
  const dragFrameRef = useRef<number | null>(null)

  const selectedCell = selection?.type === 'cell' ? { rowIndex: selection.rowIndex, columnId: selection.columnId } : null
  const selectedColumn = selection?.type === 'column' ? selection.columnId : (selection?.type === 'cell' ? selection.columnId : null)
  const isHeaderRowSelected = selection?.type === 'header-row' || selection?.type === 'corner'
  const isIndexColumnSelected = selection?.type === 'index-column' || selection?.type === 'corner'
  const isCornerSelected = selection?.type === 'corner'

  const selectCell = useCallback((
    rowIndex: number,
    columnId: string,
    options?: { extend?: boolean },
  ) => {
    const colIndex = columns.findIndex(c => c.id === columnId)
    if (colIndex < 0) return

    if (options?.extend && selection?.type === 'cell') {
      const anchor = rangeAnchorRef.current ?? {
        rowIndex: selection.rowIndex,
        colIndex: columns.findIndex(c => c.id === selection.columnId),
      }
      if (anchor.colIndex < 0) return
      rangeAnchorRef.current = anchor
      setSelection({ type: 'cell', rowIndex, columnId })
      setCellRangeSelection({
        startRow: Math.min(anchor.rowIndex, rowIndex),
        endRow: Math.max(anchor.rowIndex, rowIndex),
        startColIndex: Math.min(anchor.colIndex, colIndex),
        endColIndex: Math.max(anchor.colIndex, colIndex),
      })
      return
    }

    rangeAnchorRef.current = { rowIndex, colIndex }
    setSelection({ type: 'cell', rowIndex, columnId })
    setCellRangeSelection(null)
  }, [columns, selection])

  const handleCellMouseDown = useCallback((rowIndex: number, columnId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()

    const colIndex = columns.findIndex(c => c.id === columnId)
    if (colIndex < 0) return

    if (e.shiftKey && selection?.type === 'cell') {
      selectCell(rowIndex, columnId, { extend: true })
      return
    }

    isDraggingSelectionRef.current = true
    dragSelectionStart.current = { rowIndex, colIndex }
    selectCell(rowIndex, columnId)
  }, [columns, selectCell, selection])

  const handleCellMouseEnter = useCallback((rowIndex: number, columnId: string) => {
    if (isDraggingSelectionRef.current && dragSelectionStart.current) {
      const colIndex = columns.findIndex(c => c.id === columnId)
      const startRow = Math.min(dragSelectionStart.current.rowIndex, rowIndex)
      const endRow = Math.max(dragSelectionStart.current.rowIndex, rowIndex)
      const startColIndex = Math.min(dragSelectionStart.current.colIndex, colIndex)
      const endColIndex = Math.max(dragSelectionStart.current.colIndex, colIndex)

      pendingDragRangeRef.current = startRow !== endRow || startColIndex !== endColIndex
        ? { startRow, endRow, startColIndex, endColIndex }
        : null

      if (dragFrameRef.current === null) {
        dragFrameRef.current = requestAnimationFrame(() => {
          dragFrameRef.current = null
          setCellRangeSelection(pendingDragRangeRef.current)
        })
      }
    }
  }, [columns])

  const handleSelectionMouseUp = useCallback(() => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
      setCellRangeSelection(pendingDragRangeRef.current)
    }
    isDraggingSelectionRef.current = false
    dragSelectionStart.current = null
    pendingDragRangeRef.current = null
  }, [])

  const handleColumnClick = useCallback((columnId: string) => {
    setSelection({ type: 'column', columnId })
    setCellRangeSelection(null)
    rangeAnchorRef.current = null
  }, [])

  const handleRowClick = useCallback((rowIndex: number) => {
    setSelection({ type: 'row', rowIndex })
    setCellRangeSelection(null)
    rangeAnchorRef.current = null
  }, [])

  const handleCornerClick = useCallback(() => {
    setSelection({ type: 'corner' })
    setCellRangeSelection(null)
    rangeAnchorRef.current = null
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
      const target = e.target instanceof HTMLElement ? e.target : null
      if (!target?.closest('[role="grid"]') || target.matches('input, textarea, [contenteditable="true"]')) return
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        toggleHighlightForSelection()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleHighlightForSelection])

  useEffect(() => {
    const endDrag = () => {
      if (isDraggingSelectionRef.current) {
        handleSelectionMouseUp()
      }
    }

    document.addEventListener('mouseup', endDrag)
    window.addEventListener('blur', endDrag)
    return () => {
      document.removeEventListener('mouseup', endDrag)
      window.removeEventListener('blur', endDrag)
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
    }
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
    selectCell,
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
