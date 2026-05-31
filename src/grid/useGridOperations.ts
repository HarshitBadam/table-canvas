import { useState, useCallback } from 'react'
import { useProjectStore } from '@/state/projectStore'
import type { CellValue, ColumnSchema, UserColumnType } from '@/types'
import { generateId } from '@/lib/utils'
import type { ContextMenuState } from './GridContextMenu'
import type { GridRow } from './types'

export function useGridOperations(
  tableId: string,
  columns: ColumnSchema[],
  rows: GridRow[],
  isEditable: boolean,
  saveSnapshot: (label: string) => void,
) {
  const insertRow = useProjectStore((state) => state.insertRow)
  const deleteRow = useProjectStore((state) => state.deleteRow)
  const addColumn = useProjectStore((state) => state.addColumn)
  const insertColumnAt = useProjectStore((state) => state.insertColumnAt)
  const addFormulaColumn = useProjectStore((state) => state.addFormulaColumn)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [newColumnModal, setNewColumnModal] = useState<{ isOpen: boolean; insertIndex: number }>({ isOpen: false, insertIndex: 0 })

  const doInsertRow = useCallback((index: number) => {
    if (!isEditable) return
    saveSnapshot('Insert row')
    const newRowId = generateId()
    const values: Record<string, CellValue> = {}
    columns.forEach(col => { values[col.id] = '' })
    insertRow(tableId, newRowId, values, index)
  }, [isEditable, saveSnapshot, columns, insertRow, tableId])

  const openNewColumnModal = useCallback((index: number) => {
    if (!isEditable) return
    setNewColumnModal({ isOpen: true, insertIndex: index })
  }, [isEditable])

  const doInsertColumn = useCallback((
    index: number, name: string, type: UserColumnType, formula?: string
  ) => {
    if (!isEditable) return
    saveSnapshot(formula ? 'Add formula column' : 'Insert column')
    if (formula) {
      addFormulaColumn(tableId, name, formula, type, index)
    } else if (insertColumnAt) {
      insertColumnAt(tableId, name, type, index)
    } else {
      addColumn(tableId, name, type)
    }
  }, [isEditable, saveSnapshot, insertColumnAt, addColumn, addFormulaColumn, tableId])

  const handleContextMenu = useCallback((
    e: React.MouseEvent,
    type: 'cell' | 'row' | 'column' | 'header' | 'index' | 'corner',
    rowIndex?: number,
    columnId?: string
  ) => {
    e.preventDefault()
    if (!isEditable) return
    setContextMenu({ x: e.clientX, y: e.clientY, type, rowIndex, columnId })
  }, [isEditable])

  const handleInsertRowAbove = useCallback(() => {
    if (contextMenu?.rowIndex !== undefined) doInsertRow(contextMenu.rowIndex)
    else if (contextMenu?.type === 'header') doInsertRow(0)
    setContextMenu(null)
  }, [contextMenu, doInsertRow])

  const handleInsertRowBelow = useCallback(() => {
    if (contextMenu?.rowIndex !== undefined) doInsertRow(contextMenu.rowIndex + 1)
    else if (contextMenu?.type === 'header') doInsertRow(0)
    setContextMenu(null)
  }, [contextMenu, doInsertRow])

  const handleDeleteRow = useCallback(() => {
    if (!isEditable || contextMenu?.rowIndex === undefined) return
    const row = rows[contextMenu.rowIndex]
    if (!row) return
    saveSnapshot('Delete row')
    deleteRow(tableId, row.__rowId)
    setContextMenu(null)
  }, [isEditable, contextMenu, rows, saveSnapshot, deleteRow, tableId])

  const handleInsertColumnLeft = useCallback(() => {
    if (contextMenu?.columnId) {
      const colIndex = columns.findIndex(c => c.id === contextMenu.columnId)
      if (colIndex >= 0) openNewColumnModal(colIndex)
    } else if (contextMenu?.type === 'index' || contextMenu?.type === 'corner') {
      openNewColumnModal(0)
    }
    setContextMenu(null)
  }, [contextMenu, columns, openNewColumnModal])

  const handleInsertColumnRight = useCallback(() => {
    if (contextMenu?.columnId) {
      const colIndex = columns.findIndex(c => c.id === contextMenu.columnId)
      if (colIndex >= 0) openNewColumnModal(colIndex + 1)
    } else if (contextMenu?.type === 'index' || contextMenu?.type === 'corner') {
      openNewColumnModal(0)
    }
    setContextMenu(null)
  }, [contextMenu, columns, openNewColumnModal])

  return {
    contextMenu,
    setContextMenu,
    newColumnModal,
    setNewColumnModal,
    doInsertRow,
    openNewColumnModal,
    doInsertColumn,
    handleContextMenu,
    handleInsertRowAbove,
    handleInsertRowBelow,
    handleDeleteRow,
    handleInsertColumnLeft,
    handleInsertColumnRight,
  }
}
