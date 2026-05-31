import { useEffect } from 'react'
import type { CellValue, ColumnSchema } from '@/types'
import type { GridRow, SelectionType } from './types'
import type { CellRangeSelection } from './useGridSelection'
import type { GridClipboardData } from './types'

interface UseGridKeyboardOptions {
  editingCell: { rowIndex: number; columnId: string } | null
  selectedCell: { rowIndex: number; columnId: string } | null
  selection: SelectionType
  columns: ColumnSchema[]
  rows: GridRow[]
  isEditable: boolean
  cellRangeSelection: CellRangeSelection | null
  setSelection: (sel: SelectionType) => void
  commitEdit: () => void
  cancelEdit: () => void
  startEditing: (rowIndex: number, columnId: string, currentValue: CellValue) => void
  getDisplayValue: (rowId: string, columnId: string, baseValue: CellValue, row?: GridRow) => CellValue
  saveSnapshot: (label: string) => void
  setCellValue: (tableId: string, rowId: string, columnId: string, value: CellValue) => void
  tableId: string
  getSelectedCellData: () => GridClipboardData | null
  formatClipboardText: (data: GridClipboardData) => string
}

export function useGridKeyboard({
  editingCell,
  selectedCell,
  selection,
  columns,
  rows,
  isEditable,
  cellRangeSelection,
  setSelection,
  commitEdit,
  cancelEdit,
  startEditing,
  getDisplayValue,
  saveSnapshot,
  setCellValue,
  tableId,
  getSelectedCellData,
  formatClipboardText,
}: UseGridKeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (cellRangeSelection || selection?.type === 'cell') {
          const data = getSelectedCellData()
          if (data) {
            e.preventDefault()
            window.__gridClipboard = data
            navigator.clipboard.writeText(formatClipboardText(data)).catch(console.error)
          }
        }
      }

      if (editingCell) {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitEdit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
        } else if (e.key === 'Tab') {
          e.preventDefault()
          commitEdit()
          const colIndex = columns.findIndex(c => c.id === editingCell.columnId)
          if (colIndex < columns.length - 1) {
            const nextCol = columns[colIndex + 1]
            const row = rows[editingCell.rowIndex]
            if (row && nextCol) {
              startEditing(editingCell.rowIndex, nextCol.id, getDisplayValue(row.__rowId, nextCol.id, row[nextCol.id], row))
            }
          }
        }
        return
      }

      if (selectedCell) {
        const { rowIndex, columnId } = selectedCell
        const colIndex = columns.findIndex(c => c.id === columnId)

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (rowIndex > 0) {
            setSelection({ type: 'cell', rowIndex: rowIndex - 1, columnId })
          } else {
            setSelection({ type: 'header-row' })
          }
        } else if (e.key === 'ArrowDown' && rowIndex < rows.length - 1) {
          e.preventDefault()
          setSelection({ type: 'cell', rowIndex: rowIndex + 1, columnId })
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (colIndex > 0) {
            setSelection({ type: 'cell', rowIndex, columnId: columns[colIndex - 1].id })
          } else {
            setSelection({ type: 'row', rowIndex })
          }
        } else if (e.key === 'ArrowRight' && colIndex < columns.length - 1) {
          e.preventDefault()
          setSelection({ type: 'cell', rowIndex, columnId: columns[colIndex + 1].id })
        } else if ((e.key === 'Enter' || e.key === 'F2') && isEditable) {
          e.preventDefault()
          const row = rows[rowIndex]
          if (row) {
            startEditing(rowIndex, columnId, getDisplayValue(row.__rowId, columnId, row[columnId], row))
          }
        } else if (e.key === 'Delete' && isEditable) {
          e.preventDefault()
          const row = rows[rowIndex]
          if (row) {
            saveSnapshot('Clear cell')
            setCellValue(tableId, row.__rowId, columnId, '')
          }
        }
      } else if (selection?.type === 'header-row' && e.key === 'ArrowDown' && rows.length > 0) {
        e.preventDefault()
        setSelection({ type: 'cell', rowIndex: 0, columnId: columns[0]?.id || '' })
      } else if (selection?.type === 'row' && e.key === 'ArrowRight' && columns.length > 0) {
        e.preventDefault()
        setSelection({ type: 'cell', rowIndex: selection.rowIndex, columnId: columns[0].id })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingCell, selectedCell, selection, columns, rows, isEditable, commitEdit, cancelEdit, startEditing, getDisplayValue, saveSnapshot, setCellValue, tableId, cellRangeSelection, getSelectedCellData, formatClipboardText])
}
