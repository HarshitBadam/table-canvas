import { useEffect } from 'react'
import type { CellValue, ColumnSchema } from '@/types'
import type { GridRow, SelectionType } from './types'
import type { CellRangeSelection } from './useGridSelection'
import type { GridClipboardData } from './types'
import type { GridFeedbackMessage } from './GridFeedback'
import { useProjectStore } from '@/state/projectStore'
import { createGridPastePlan, describePasteSkips } from './gridPaste'

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
  onFeedback: (feedback: GridFeedbackMessage) => void
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
  onFeedback,
}: UseGridKeyboardOptions) {
  const undo = useProjectStore((state) => state.undo)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null
      if (!target?.closest('[role="grid"]')) return

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

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (cellRangeSelection || selection?.type === 'cell') {
          const data = getSelectedCellData()
          if (data) {
            e.preventDefault()
            window.__gridClipboard = data
            navigator.clipboard.writeText(formatClipboardText(data)).catch(() => {
              onFeedback({
                message: 'Could not copy to the system clipboard. Check browser clipboard permissions.',
                tone: 'error',
              })
            })
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
  }, [editingCell, selectedCell, selection, columns, rows, isEditable, setSelection, commitEdit, cancelEdit, startEditing, getDisplayValue, saveSnapshot, setCellValue, tableId, cellRangeSelection, getSelectedCellData, formatClipboardText, onFeedback])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!isEditable || editingCell || !selectedCell) return

      const target = event.target instanceof HTMLElement ? event.target : null
      if (!target?.closest('[role="grid"]')) return
      if (target.matches('input, textarea, [contenteditable="true"]')) return

      const text = event.clipboardData?.getData('text/plain')
      if (!text) return

      event.preventDefault()

      const startRow = cellRangeSelection?.startRow ?? selectedCell.rowIndex
      const selectedColumnIndex = columns.findIndex(column => column.id === selectedCell.columnId)
      const startColIndex = cellRangeSelection?.startColIndex ?? selectedColumnIndex
      if (startColIndex < 0) return

      const plan = createGridPastePlan({
        text,
        startRow,
        startColIndex,
        rows,
        columns,
      })
      const skippedCount = plan.invalidCount + plan.readOnlyCount + plan.outOfBoundsCount

      if (!plan.changes.length) {
        const reason = describePasteSkips(plan)
        onFeedback({
          message: reason ? `Nothing was pasted: ${reason}.` : 'Nothing was pasted.',
          tone: 'warning',
        })
        return
      }

      saveSnapshot('Paste cells')
      plan.changes.forEach(change => {
        setCellValue(tableId, change.rowId, change.columnId, change.value)
      })

      const pastedLabel = `${plan.changes.length} cell${plan.changes.length === 1 ? '' : 's'} pasted.`
      const skippedLabel = skippedCount ? ` ${skippedCount} skipped: ${describePasteSkips(plan)}.` : ''
      onFeedback({
        message: pastedLabel + skippedLabel,
        tone: skippedCount ? 'warning' : 'success',
        actionLabel: 'Undo',
        onAction: () => {
          undo()
          onFeedback({ message: 'Paste undone.', tone: 'success' })
        },
      })
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [cellRangeSelection, columns, editingCell, isEditable, onFeedback, rows, saveSnapshot, selectedCell, setCellValue, tableId, undo])
}
