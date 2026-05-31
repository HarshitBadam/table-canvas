import { useState, useCallback } from 'react'
import { useProjectStore } from '@/state/projectStore'
import type { CellValue, ColumnSchema } from '@/types'
import type { GridRow } from './types'

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

  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editColumnName, setEditColumnName] = useState<string>('')

  const validateValue = useCallback((value: string, columnType: string): { valid: boolean; error: string | null; parsedValue: CellValue } => {
    if (value === '' || value.trim() === '') {
      return { valid: true, error: null, parsedValue: '' }
    }
    switch (columnType) {
      case 'number': {
        const cleanValue = value.replace(/,/g, '').trim()
        const num = Number(cleanValue)
        if (isNaN(num)) return { valid: false, error: 'Please enter a valid number', parsedValue: value }
        return { valid: true, error: null, parsedValue: num }
      }
      case 'boolean': {
        const lower = value.toLowerCase().trim()
        if (['true', 'false', '1', '0', 'yes', 'no'].includes(lower)) {
          return { valid: true, error: null, parsedValue: ['true', '1', 'yes'].includes(lower) ? 'True' : 'False' }
        }
        return { valid: false, error: 'Please enter true/false, yes/no, or 1/0', parsedValue: value }
      }
      case 'date': {
        const date = new Date(value)
        if (isNaN(date.getTime())) return { valid: false, error: 'Please enter a valid date (e.g., 2024-01-15 or Jan 15, 2024)', parsedValue: value }
        return { valid: true, error: null, parsedValue: value }
      }
      default:
        return { valid: true, error: null, parsedValue: value }
    }
  }, [])

  const startEditing = useCallback((rowIndex: number, columnId: string, currentValue: CellValue) => {
    if (!isEditable) return
    setEditingCell({ rowIndex, columnId })
    let editVal = String(currentValue ?? '')
    const column = columns.find(c => c.id === columnId)
    if (column?.type === 'boolean' || typeof currentValue === 'boolean') {
      if (currentValue === true || currentValue === 'true' || currentValue === 'True') editVal = 'True'
      else if (currentValue === false || currentValue === 'false' || currentValue === 'False') editVal = 'False'
    }
    setEditValue(editVal)
    setEditError(null)
  }, [isEditable, columns])

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    const row = rows[editingCell.rowIndex]
    if (!row) return
    const column = columns.find(c => c.id === editingCell.columnId)
    const columnType = column?.type || 'string'
    const validation = validateValue(editValue, columnType)
    if (!validation.valid) {
      setEditError(validation.error)
      return
    }
    saveSnapshot('Edit cell')
    setCellValue(tableId, row.__rowId, editingCell.columnId, validation.parsedValue)
    setEditingCell(null)
    setEditValue('')
    setEditError(null)
  }, [editingCell, rows, tableId, editValue, setCellValue, saveSnapshot, columns, validateValue])

  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
    setEditError(null)
  }, [])

  const handleCellDoubleClick = useCallback((rowIndex: number, columnId: string, currentValue: CellValue) => {
    if (!isEditable) return
    const column = columns.find(c => c.id === columnId)
    if (column?.isComputed) return
    startEditing(rowIndex, columnId, currentValue)
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
    setEditValue,
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
