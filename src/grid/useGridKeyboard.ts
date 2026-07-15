import { useEffect } from 'react'
import type { CellValue, ColumnSchema } from '@/types'
import type { GridRow, SelectionType } from './types'
import type { CellRangeSelection } from './useGridSelection'
import type { GridClipboardData } from './types'
import type { GridFeedbackMessage } from './GridFeedback'
import { useProjectStore } from '@/state/projectStore'
import { createGridPastePlan, describePasteSkips } from './gridPaste'
import { getEditableCellsInSelection, getNavigationTarget } from './gridNavigation'

interface UseGridKeyboardOptions {
  editingCell: { rowIndex: number; columnId: string } | null
  selectedCell: { rowIndex: number; columnId: string } | null
  selection: SelectionType
  columns: ColumnSchema[]
  rows: GridRow[]
  isEditable: boolean
  cellRangeSelection: CellRangeSelection | null
  setSelection: (sel: SelectionType) => void
  selectCell: (rowIndex: number, columnId: string, options?: { extend?: boolean }) => void
  commitEdit: () => boolean
  cancelEdit: () => void
  startEditing: (
    rowIndex: number,
    columnId: string,
    currentValue: CellValue,
    options?: { initialValue?: string; selectValue?: boolean },
  ) => void
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
  selectCell,
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
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const committed = commitEdit()
          if (!committed) return

          if (e.key === 'Enter') {
            selectCell(editingCell.rowIndex, editingCell.columnId)
            return
          }

          const colIndex = columns.findIndex(c => c.id === editingCell.columnId)
          if (colIndex < 0) return
          const targetCell = getNavigationTarget(
            { rowIndex: editingCell.rowIndex, colIndex },
            e.key,
            rows.length,
            columns.length,
            e.shiftKey,
          )
          const targetColumn = columns[targetCell.colIndex]
          if (targetColumn) selectCell(targetCell.rowIndex, targetColumn.id)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
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
        if (colIndex < 0) return

        if (
          (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
          && !e.metaKey
          && !e.ctrlKey
          && !e.altKey
        ) {
          e.preventDefault()
          const targetCell = getNavigationTarget(
            { rowIndex, colIndex },
            e.key,
            rows.length,
            columns.length,
          )
          const targetColumn = columns[targetCell.colIndex]
          if (targetColumn) {
            selectCell(targetCell.rowIndex, targetColumn.id, { extend: e.shiftKey })
          }
        } else if (e.key === 'Enter' && isEditable) {
          e.preventDefault()
          const row = rows[rowIndex]
          if (row) {
            startEditing(
              rowIndex,
              columnId,
              getDisplayValue(row.__rowId, columnId, row[columnId], row),
              { selectValue: true },
            )
          }
        } else if (e.key === 'Tab') {
          e.preventDefault()
          const targetCell = getNavigationTarget(
            { rowIndex, colIndex },
            e.key,
            rows.length,
            columns.length,
            e.shiftKey,
          )
          const targetColumn = columns[targetCell.colIndex]
          if (targetColumn) selectCell(targetCell.rowIndex, targetColumn.id)
        } else if (e.key === 'F2' && isEditable) {
          e.preventDefault()
          const row = rows[rowIndex]
          if (row) {
            startEditing(
              rowIndex,
              columnId,
              getDisplayValue(row.__rowId, columnId, row[columnId], row),
              { selectValue: false },
            )
          }
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && isEditable) {
          e.preventDefault()
          const cells = getEditableCellsInSelection(
            rowIndex,
            colIndex,
            cellRangeSelection,
            rows,
            columns,
          )
          if (cells.length) {
            saveSnapshot(cells.length === 1 ? 'Clear cell' : 'Clear cells')
            cells.forEach(cell => setCellValue(tableId, cell.rowId, cell.columnId, ''))
          }
        } else if (e.key === 'Escape' && cellRangeSelection) {
          e.preventDefault()
          selectCell(rowIndex, columnId)
        } else if (
          isEditable
          && e.key.length === 1
          && !e.metaKey
          && !e.ctrlKey
          && !e.altKey
          && !e.isComposing
        ) {
          e.preventDefault()
          const row = rows[rowIndex]
          if (row) {
            startEditing(
              rowIndex,
              columnId,
              getDisplayValue(row.__rowId, columnId, row[columnId], row),
              { initialValue: e.key, selectValue: false },
            )
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
  }, [editingCell, selectedCell, selection, columns, rows, isEditable, setSelection, selectCell, commitEdit, cancelEdit, startEditing, getDisplayValue, saveSnapshot, setCellValue, tableId, cellRangeSelection, getSelectedCellData, formatClipboardText, onFeedback])

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
