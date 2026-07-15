import { useCallback, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import type { ColumnSchema, UserColumnType } from '@/types'
import type { GridFeedbackMessage } from './GridFeedback'

export function useFormulaColumnLifecycle(
  tableId: string,
  columns: ColumnSchema[],
  closeContextMenu: () => void,
  onFeedback: (feedback: GridFeedbackMessage) => void,
) {
  const updateFormulaColumn = useProjectStore(state => state.updateFormulaColumn)
  const removeFormulaColumn = useProjectStore(state => state.removeFormulaColumn)
  const undo = useProjectStore(state => state.undo)
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const editingColumn = columns.find(column => column.id === editingColumnId)

  const openEditor = useCallback((columnId: string) => {
    closeContextMenu()
    setEditingColumnId(columnId)
  }, [closeContextMenu])

  const deleteColumn = useCallback((columnId: string) => {
    closeContextMenu()
    const column = columns.find(candidate => candidate.id === columnId)
    if (!column?.isComputed) return
    if (!window.confirm(`Delete formula column "${column.name}"? This removes its values from the table.`)) {
      return
    }
    const result = removeFormulaColumn(tableId, columnId)
    if (!result.ok) {
      onFeedback({ message: result.error, tone: 'error' })
      return
    }
    onFeedback({
      message: `Formula column "${column.name}" deleted.`,
      tone: 'success',
      actionLabel: 'Undo',
      onAction: () => {
        undo()
        onFeedback({ message: `Formula column "${column.name}" restored.`, tone: 'success' })
      },
    })
  }, [closeContextMenu, columns, onFeedback, removeFormulaColumn, tableId, undo])

  const saveFormula = useCallback((
    _name: string,
    type: UserColumnType,
    formula?: string,
  ) => {
    if (!editingColumnId || !formula) return 'A formula is required.'
    const result = updateFormulaColumn(tableId, editingColumnId, formula, type)
    if (!result.ok) return result.error
    setEditingColumnId(null)
    onFeedback({
      message: 'Formula updated.',
      tone: 'success',
      actionLabel: 'Undo',
      onAction: () => {
        undo()
        onFeedback({ message: 'Formula edit undone.', tone: 'success' })
      },
    })
  }, [editingColumnId, onFeedback, tableId, undo, updateFormulaColumn])

  return {
    editingColumn,
    openEditor,
    deleteColumn,
    saveFormula,
    closeEditor: () => setEditingColumnId(null),
  }
}
