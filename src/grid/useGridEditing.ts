import { useState, useCallback, useRef } from 'react'
import { useProjectStore } from '@/state/projectStore'
import type { CellValue, ColumnSchema } from '@/types'
import type { GridRow } from './types'
import { validateCellInput } from './cellValueValidation'

export function useGridEditing(
  tableId: string,
  columns: ColumnSchema[],
  rows: GridRow[],
  isEditable: boolean,
) {
  const setCellValue = useProjectStore((state) => state.setCellValue)
  const saveSnapshot = useProjectStore((state) => state.saveSnapshot)
  const renameColumn = useProjectStore((state) => state.renameColumn)

  const [editingCell, setEditingCell] = useState<{ rowIndex: number; columnId: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editError, setEditError] = useState<string | null>(null)
  const editingCellRef = useRef<{ rowIndex: number; columnId: string } | null>(null)
  const editValueRef = useRef('')
  const [selectEditValue, setSelectEditValue] = useState(true)

  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editColumnName, setEditColumnName] = useState<string>('')

  const startEditing = useCallback((
    rowIndex: number,
    columnId: string,
    currentValue: CellValue,
    options?: { initialValue?: string; selectValue?: boolean },
  ) => {
    if (!isEditable) return
    const column = columns.find(c => c.id === columnId)
    if (column?.isComputed) return

    const nextEditingCell = { rowIndex, columnId }
    setEditingCell(nextEditingCell)
    editingCellRef.current = nextEditingCell
    let editVal = String(currentValue ?? '')
    if (column?.type === 'boolean' || typeof currentValue === 'boolean') {
      if (currentValue === true || currentValue === 'true' || currentValue === 'True') editVal = 'True'
      else if (currentValue === false || currentValue === 'false' || currentValue === 'False') editVal = 'False'
    }
    if (options?.initialValue !== undefined) editVal = options.initialValue
    setEditValue(editVal)
    editValueRef.current = editVal
    setSelectEditValue(options?.selectValue ?? true)
    setEditError(null)
  }, [isEditable, columns])

  const commitEdit = useCallback(() => {
    const cell = editingCellRef.current
    if (!cell) return true
    const row = rows[cell.rowIndex]
    if (!row) return false
    const column = columns.find(c => c.id === cell.columnId)
    const columnType = column?.type || 'string'
    const validation = validateCellInput(editValueRef.current, columnType)
    if (!validation.valid) {
      setEditError(validation.error)
      return false
    }

    editingCellRef.current = null
    if (!Object.is(row[cell.columnId], validation.parsedValue)) {
      saveSnapshot('Edit cell')
      setCellValue(tableId, row.__rowId, cell.columnId, validation.parsedValue)
    }
    setEditingCell(null)
    setEditValue('')
    editValueRef.current = ''
    setEditError(null)
    return true
  }, [rows, tableId, setCellValue, saveSnapshot, columns])

  const cancelEdit = useCallback(() => {
    editingCellRef.current = null
    setEditingCell(null)
    setEditValue('')
    editValueRef.current = ''
    setEditError(null)
  }, [])

  const updateEditValue = useCallback((value: string) => {
    editValueRef.current = value
    setEditValue(value)
    setEditError(null)
  }, [])

  const handleCellDoubleClick = useCallback((rowIndex: number, columnId: string, currentValue: CellValue) => {
    if (!isEditable) return
    const column = columns.find(c => c.id === columnId)
    if (column?.isComputed) return
    startEditing(rowIndex, columnId, currentValue, { selectValue: false })
  }, [isEditable, columns, startEditing])

  const handleColumnDoubleClick = useCallback((columnId: string, currentName: string) => {
    if (!isEditable) return
    setEditingColumnId(columnId)
    setEditColumnName(currentName)
  }, [isEditable])

  const commitColumnNameEdit = useCallback(() => {
    if (!editingColumnId || !editColumnName.trim()) {
      setEditingColumnId(null)
      setEditColumnName('')
      return
    }
    saveSnapshot('Rename column')
    renameColumn(tableId, editingColumnId, editColumnName.trim())
    setEditingColumnId(null)
    setEditColumnName('')
  }, [editingColumnId, editColumnName, saveSnapshot, renameColumn, tableId])

  const cancelColumnNameEdit = useCallback(() => {
    setEditingColumnId(null)
    setEditColumnName('')
  }, [])

  return {
    editingCell,
    editValue,
    editError,
    selectEditValue,
    setEditValue: updateEditValue,
    startEditing,
    commitEdit,
    cancelEdit,
    handleCellDoubleClick,
    editingColumnId,
    editColumnName,
    setEditColumnName,
    handleColumnDoubleClick,
    commitColumnNameEdit,
    cancelColumnNameEdit,
    saveSnapshot,
    setCellValue,
  }
}
