import { useMemo, useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import type { CellValue } from '@/types'
import { generateId } from '@/lib/utils'
import { detectPattern, generateNextValues } from './autofill'
import { useTheme } from '@/components/ThemeToggle'
import { FilterPanel } from './FilterPanel'
import { GridFilterConfig, applyFilters, createEmptyFilterConfig, hasActiveFilters } from './filterUtils'
import { FormulaColumnModal } from './FormulaColumnModal'
import { evaluateFormula, FormulaValue } from '@/formula'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { ColumnHeader } from './ColumnHeader'
import { GridCell } from './GridCell'
import { GridContextMenu } from './GridContextMenu'
import { GridToolbar } from './GridToolbar'
import type { ContextMenuState } from './GridContextMenu'
import type { GridClipboardData } from '@/types/clipboard.types'

const SuggestionsPanel = lazy(() => import('@/suggestions/SuggestionsPanel').then(m => ({ default: m.SuggestionsPanel })))
const ChartBuilder = lazy(() => import('@/charts/ChartBuilder').then(m => ({ default: m.ChartBuilder })))

interface GridViewProps {
  tableId: string
}

// Row type with index signature
interface GridRow {
  __rowId: string
  [columnId: string]: CellValue
}

// Virtual scrolling constants
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 44
const BUFFER_ROWS = 10

// Selection types - allows selecting header row or index column for insertion at position 0
type SelectionType = 
  | { type: 'cell'; rowIndex: number; columnId: string }
  | { type: 'row'; rowIndex: number }
  | { type: 'column'; columnId: string }
  | { type: 'header-row' }  // Selecting the header means "insert row at position 0"
  | { type: 'index-column' }  // Selecting the index column header means "insert column at position 0"
  | { type: 'corner' }  // Top-left corner - can insert both at position 0
  | null

// Context menu position - type imported from GridContextMenu

export function GridView({ tableId }: GridViewProps) {
  const node = useProjectStore((state) => state.getTableNode(tableId))
  const patches = useProjectStore((state) => state.patches[tableId])
  const patchVersion = useProjectStore((state) => {
    const p = state.patches[tableId]
    if (!p) return '0-0-0-0'
    // Count total cell patches across all columns (not just number of columns)
    const cellPatchCount = Object.values(p.cellPatches || {}).reduce(
      (sum, colPatches) => sum + Object.keys(colPatches).length, 
      0
    )
    const highlightCount = p.highlightedCells?.size || 0
    return `${p.insertedRows?.length || 0}-${cellPatchCount}-${p.deletedRows?.size || 0}-${highlightCount}`
  })
  const setCellValue = useProjectStore((state) => state.setCellValue)
  const saveSnapshot = useProjectStore((state) => state.saveSnapshot)
  const insertRow = useProjectStore((state) => state.insertRow)
  const deleteRow = useProjectStore((state) => state.deleteRow)
  const addColumn = useProjectStore((state) => state.addColumn)
  const insertColumnAt = useProjectStore((state) => state.insertColumnAt)
  const addFormulaColumn = useProjectStore((state) => state.addFormulaColumn)
  const renameColumn = useProjectStore((state) => state.renameColumn)
  const setTableFilters = useProjectStore((state) => state.setTableFilters)
  const toggleCellHighlight = useProjectStore((state) => state.toggleCellHighlight)
  const clearHighlights = useProjectStore((state) => state.clearHighlights)
  
  // Get highlighted cells from patches
  const highlightedCells = patches?.highlightedCells
  
  // Get persistent filters from the node
  const persistedFilters = node?.viewFilters
  
  const tableData = useDataStore((state) => state.tableData[tableId])
  
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; columnId: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editError, setEditError] = useState<string | null>(null)
  
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editColumnName, setEditColumnName] = useState<string>('')
  
  const [selection, setSelection] = useState<SelectionType>(null)
  
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  
  // Filters are persisted on the node - convert ViewFilterConfig to GridFilterConfig
  const filters: GridFilterConfig = useMemo(() => {
    if (persistedFilters && persistedFilters.conditions.length > 0) {
      return {
        conditions: persistedFilters.conditions,
        logic: persistedFilters.logic,
      }
    }
    return createEmptyFilterConfig()
  }, [persistedFilters])
  
  // Handler to update filters - saves to projectStore for persistence
  const handleFiltersChange = useCallback((newFilters: GridFilterConfig) => {
    setTableFilters(tableId, newFilters.conditions.length > 0 ? newFilters : null)
  }, [tableId, setTableFilters])
  
  const [newColumnModal, setNewColumnModal] = useState<{ isOpen: boolean; insertIndex: number }>({ isOpen: false, insertIndex: 0 })
  
  const [chartBuilderOpen, setChartBuilderOpen] = useState(false)
  const [chartPreselectedColumn, setChartPreselectedColumn] = useState<string | undefined>(undefined)
  
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)
  
  const { theme, toggleTheme } = useTheme()
  
  const DEFAULT_COLUMN_WIDTH = 150
  const MIN_COLUMN_WIDTH = 60
  const MAX_COLUMN_WIDTH = 500
  
  const getColumnWidth = useCallback((columnId: string) => {
    return columnWidths[columnId] || DEFAULT_COLUMN_WIDTH
  }, [columnWidths])
  
  // Multi-cell rectangular selection state (Excel-style)
  const [cellRangeSelection, setCellRangeSelection] = useState<{
    startRow: number
    endRow: number
    startColIndex: number
    endColIndex: number
  } | null>(null)
  
  // Drag selection state - use ref for immediate access in event handlers
  const isDraggingSelectionRef = useRef(false)
  const dragSelectionStart = useRef<{ rowIndex: number; colIndex: number } | null>(null)
  
  const [autofillDragging, setAutofillDragging] = useState(false)
  const [autofillEndRow, setAutofillEndRow] = useState<number | null>(null)
  const [autofillPreview, setAutofillPreview] = useState<{ rowIndex: number; value: CellValue }[]>([])
  const autofillColumnId = useRef<string | null>(null)
  
  const [isMaterializing, setIsMaterializing] = useState(false)
  const [materializationError, setMaterializationError] = useState<string | null>(null)
  
  const cacheInfo = node && (node.kind === 'source_table' || node.kind === 'derived_table') 
    ? node.cacheInfo 
    : undefined
  const isDirty = cacheInfo?.isDirty ?? false
  const isComputing = cacheInfo?.isComputing ?? false
  const computationError = cacheInfo?.error

  const schema = node?.schema
  const columns = schema?.columns ?? []
  const isEditable = node?.kind === 'source_table'
  
  // Get data rows merged with inserted rows from patches
  const rows: GridRow[] = useMemo(() => {
    let baseRows: GridRow[] = []
    if (tableData?.rows) {
      baseRows = tableData.rows as GridRow[]
    }
    
    const insertedRows = patches?.insertedRows ?? []
    
    if (insertedRows.length > 0) {
      const newRows: GridRow[] = insertedRows.map((inserted) => {
        const row: GridRow = { __rowId: inserted.rowId }
        Object.entries(inserted.values).forEach(([colId, value]) => {
          row[colId] = value
        })
        columns.forEach((col) => {
          if (row[col.id] === undefined) {
            row[col.id] = ''
          }
        })
        return row
      })
      
      return [...baseRows, ...newRows]
    }
    
    return baseRows
  }, [tableData, patches, columns, patchVersion])

  // Apply patches to get display values, including formula evaluation
  const getDisplayValue = useCallback((rowId: string, columnId: string, baseValue: CellValue, row?: GridRow): CellValue => {
    // Check for patches first
    if (patches?.cellPatches?.[columnId]?.[rowId] !== undefined) {
      return patches.cellPatches[columnId][rowId]
    }
    
    // Check if this is a formula column
    const column = columns.find(c => c.id === columnId)
    if (column?.formula && column.isComputed && row) {
      // Build context for formula evaluation
      const rowData: Record<string, FormulaValue> = {}
      columns.forEach(col => {
        if (!col.isComputed) {
          const val = patches?.cellPatches?.[col.id]?.[rowId] ?? row[col.id]
          rowData[col.id] = val as FormulaValue
        }
      })
      
      const columnInfo = columns
        .filter(c => !c.isComputed)
        .map(c => ({ id: c.id, name: c.name, type: c.type }))
      
      const result = evaluateFormula(column.formula, {
        row: rowData,
        columns: columnInfo,
      })
      
      if (result.success) {
        return result.value as CellValue
      }
      // Return error indicator for formula errors
      return '#ERROR'
    }
    
    return baseValue
  }, [patches, columns])

  const isRowDeleted = useCallback((rowId: string): boolean => {
    return patches?.deletedRows?.has(rowId) ?? false
  }, [patches])

  const filteredRows = useMemo(() => {
    // First filter out deleted rows
    const nonDeletedRows = rows.filter(row => !isRowDeleted(row.__rowId))
    
    // Then apply user filters
    if (!hasActiveFilters(filters)) {
      return nonDeletedRows
    }
    return applyFilters(nonDeletedRows, filters, columns, getDisplayValue)
  }, [rows, filters, columns, getDisplayValue, isRowDeleted])

  // Virtual scrolling calculations - use filteredRows instead of rows
  const totalRows = filteredRows.length
  const unfilteredTotalRows = rows.filter(row => !isRowDeleted(row.__rowId)).length
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS)
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS
  )
  // Use filteredRows which already excludes deleted rows
  const visibleRows = filteredRows.slice(startIndex, endIndex)

  const selectedCell = selection?.type === 'cell' ? { rowIndex: selection.rowIndex, columnId: selection.columnId } : null
  const selectedColumn = selection?.type === 'column' ? selection.columnId : (selection?.type === 'cell' ? selection.columnId : null)
  const isHeaderRowSelected = selection?.type === 'header-row' || selection?.type === 'corner'
  const isIndexColumnSelected = selection?.type === 'index-column' || selection?.type === 'corner'
  const isCornerSelected = selection?.type === 'corner'

  // Get the insertion position for rows based on selection
  const getRowInsertionIndex = useCallback((): number => {
    if (!selection) return rows.length // No selection = end
    switch (selection.type) {
      case 'cell':
        return selection.rowIndex + 1 // Below selected cell
      case 'row':
        return selection.rowIndex + 1 // Below selected row
      case 'header-row':
      case 'corner':
        return 0 // At the beginning
      case 'column':
      case 'index-column':
        return rows.length // End (column selected doesn't affect row position)
      default:
        return rows.length
    }
  }, [selection, rows.length])

  // Get the insertion position for columns based on selection
  const getColumnInsertionIndex = useCallback((): number => {
    if (!selection) return columns.length // No selection = end
    switch (selection.type) {
      case 'cell': {
        const cellColIdx = columns.findIndex(c => c.id === selection.columnId)
        return cellColIdx >= 0 ? cellColIdx + 1 : columns.length // Right of selected cell
      }
      case 'column': {
        const colIdx = columns.findIndex(c => c.id === selection.columnId)
        return colIdx >= 0 ? colIdx + 1 : columns.length // Right of selected column
      }
      case 'index-column':
      case 'corner':
      case 'row':
        return 0 // At the beginning (row or index selected = insert as first column)
      case 'header-row':
        return columns.length // End
      default:
        return columns.length
    }
  }, [selection, columns])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Measure container on mount and resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height)
    })
    observer.observe(container)
    setContainerHeight(container.clientHeight)

    return () => observer.disconnect()
  }, [])

  // Materialize table on mount or when dirty
  useEffect(() => {
    if (!node) return
    
    // Skip if already computing
    if (isComputing || isMaterializing) {
      return
    }
    
    // Materialize if dirty or no data loaded yet
    // Note: Don't rematerialize just because rows.length === 0 - empty tables are valid
    const hasBeenComputed = cacheInfo?.lastComputedAt && !cacheInfo?.error
    const needsMaterialization = isDirty || !tableData || !tableData.rows || 
      (tableData.rows.length === 0 && !hasBeenComputed)
    
    if (needsMaterialization && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      setIsMaterializing(true)
      setMaterializationError(null)
      
      ensureTableMaterialized(tableId)
        .then((result) => {
          if (result.status === 'error') {
            setMaterializationError(result.error || 'Unknown error')
          } else {
            setMaterializationError(null)
          }
        })
        .catch((error) => {
          setMaterializationError(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          setIsMaterializing(false)
        })
    }
  }, [tableId, node, isDirty, isComputing, isMaterializing, tableData, cacheInfo])

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  // Validate value against column type
  const validateValue = useCallback((value: string, columnType: string): { valid: boolean; error: string | null; parsedValue: CellValue } => {
    // Empty values are allowed (nullable)
    if (value === '' || value.trim() === '') {
      return { valid: true, error: null, parsedValue: '' }
    }
    
    switch (columnType) {
      case 'number': {
        // Remove commas and whitespace for number parsing
        const cleanValue = value.replace(/,/g, '').trim()
        const num = Number(cleanValue)
        if (isNaN(num)) {
          return { valid: false, error: 'Please enter a valid number', parsedValue: value }
        }
        return { valid: true, error: null, parsedValue: num }
      }
      case 'boolean': {
        const lower = value.toLowerCase().trim()
        if (['true', 'false', '1', '0', 'yes', 'no'].includes(lower)) {
          // Store as "True" or "False" string for consistent display
          const boolValue = ['true', '1', 'yes'].includes(lower) ? 'True' : 'False'
          return { valid: true, error: null, parsedValue: boolValue }
        }
        return { valid: false, error: 'Please enter true/false, yes/no, or 1/0', parsedValue: value }
      }
      case 'date': {
        // Accept various date formats
        const date = new Date(value)
        if (isNaN(date.getTime())) {
          return { valid: false, error: 'Please enter a valid date (e.g., 2024-01-15 or Jan 15, 2024)', parsedValue: value }
        }
        return { valid: true, error: null, parsedValue: value }
      }
      default:
        // String type - accept anything
        return { valid: true, error: null, parsedValue: value }
    }
  }, [])

  const startEditing = useCallback((rowIndex: number, columnId: string, currentValue: CellValue) => {
    if (!isEditable) return
    setEditingCell({ rowIndex, columnId })
    
    // Format the value for editing - normalize booleans to "True"/"False"
    let editVal = String(currentValue ?? '')
    const column = columns.find(c => c.id === columnId)
    if (column?.type === 'boolean' || typeof currentValue === 'boolean') {
      if (currentValue === true || currentValue === 'true' || currentValue === 'True') {
        editVal = 'True'
      } else if (currentValue === false || currentValue === 'false' || currentValue === 'False') {
        editVal = 'False'
      }
    }
    
    setEditValue(editVal)
    setEditError(null)
  }, [isEditable, columns])

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    
    const row = rows[editingCell.rowIndex]
    if (!row) return

    // Get the column type
    const column = columns.find(c => c.id === editingCell.columnId)
    const columnType = column?.type || 'string'
    
    // Validate the value
    const validation = validateValue(editValue, columnType)
    
    if (!validation.valid) {
      setEditError(validation.error)
      return // Don't commit, keep editing
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

  // Selection handlers - click and drag for multi-select (Excel-style rectangular)
  const handleCellMouseDown = useCallback((rowIndex: number, columnId: string, e: React.MouseEvent) => {
    // Don't start selection if right-clicking
    if (e.button !== 0) return
    
    const colIndex = columns.findIndex(c => c.id === columnId)
    
    // Start drag selection
    isDraggingSelectionRef.current = true
    dragSelectionStart.current = { rowIndex, colIndex }
    setSelection({ type: 'cell', rowIndex, columnId })
    setCellRangeSelection(null)
  }, [columns])

  const handleCellMouseEnter = useCallback((rowIndex: number, columnId: string) => {
    // If dragging, extend rectangular selection
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

  // Toggle highlight for selected cells (works with rectangular selection)
  const toggleHighlightForSelection = useCallback(() => {
    if (!filteredRows.length) return
    
    if (cellRangeSelection) {
      // Rectangular selection - toggle all cells in range
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
      // Single cell selection
      const row = filteredRows[selection.rowIndex]
      if (row) {
        toggleCellHighlight(tableId, row.__rowId, selection.columnId)
      }
    }
  }, [cellRangeSelection, selection, filteredRows, columns, tableId, toggleCellHighlight])

  // Keyboard shortcut for highlighting (Ctrl/Cmd + H)
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

  const handleCellDoubleClick = useCallback((rowIndex: number, columnId: string, currentValue: CellValue) => {
    if (!isEditable) return
    
    // Don't allow editing formula columns
    const column = columns.find(c => c.id === columnId)
    if (column?.isComputed) return
    
    startEditing(rowIndex, columnId, currentValue)
  }, [isEditable, columns, startEditing])

  const handleColumnClick = useCallback((columnId: string) => {
    setSelection({ type: 'column', columnId })
  }, [])

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

  const handleResizeStart = useCallback((columnId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnId)
    setResizeStartX(e.clientX)
    setResizeStartWidth(getColumnWidth(columnId))
  }, [getColumnWidth])

  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, resizeStartWidth + delta))
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth])

  const handleRowClick = useCallback((rowIndex: number) => {
    setSelection({ type: 'row', rowIndex })
  }, [])

  const handleCornerClick = useCallback(() => {
    setSelection({ type: 'corner' })
  }, [])

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

  const doInsertRow = useCallback((index: number) => {
    if (!isEditable) return
    saveSnapshot('Insert row')
    const newRowId = generateId()
    const values: Record<string, CellValue> = {}
    columns.forEach(col => {
      values[col.id] = ''
    })
    insertRow(tableId, newRowId, values, index)
  }, [isEditable, saveSnapshot, columns, insertRow, tableId])

  const openNewColumnModal = useCallback((index: number) => {
    if (!isEditable) return
    setNewColumnModal({ isOpen: true, insertIndex: index })
  }, [isEditable])

  const doInsertColumn = useCallback((
    index: number, 
    name: string, 
    type: 'string' | 'number' | 'boolean' | 'date',
    formula?: string
  ) => {
    if (!isEditable) return
    saveSnapshot(formula ? 'Add formula column' : 'Insert column')
    
    if (formula) {
      // Add as a formula column
      addFormulaColumn(tableId, name, formula, type, index)
    } else if (insertColumnAt) {
      insertColumnAt(tableId, name, type, index)
    } else {
      addColumn(tableId, name, type)
    }
  }, [isEditable, saveSnapshot, insertColumnAt, addColumn, addFormulaColumn, tableId])

  const handleNewColumnConfirm = useCallback((
    name: string,
    type: 'string' | 'number' | 'boolean' | 'date',
    formula?: string
  ) => {
    doInsertColumn(newColumnModal.insertIndex, name, type, formula)
    setNewColumnModal({ isOpen: false, insertIndex: 0 })
  }, [newColumnModal.insertIndex, doInsertColumn])

  const handleNewColumnCancel = useCallback(() => {
    setNewColumnModal({ isOpen: false, insertIndex: 0 })
  }, [])

  const handleInsertRowAbove = useCallback(() => {
    if (contextMenu?.rowIndex !== undefined) {
      doInsertRow(contextMenu.rowIndex)
    } else if (contextMenu?.type === 'header') {
      doInsertRow(0)
    }
    setContextMenu(null)
  }, [contextMenu, doInsertRow])

  const handleInsertRowBelow = useCallback(() => {
    if (contextMenu?.rowIndex !== undefined) {
      doInsertRow(contextMenu.rowIndex + 1)
    } else if (contextMenu?.type === 'header') {
      doInsertRow(0)
    }
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
      if (colIndex >= 0) {
        openNewColumnModal(colIndex)
      }
    } else if (contextMenu?.type === 'index' || contextMenu?.type === 'corner') {
      openNewColumnModal(0)
    }
    setContextMenu(null)
  }, [contextMenu, columns, openNewColumnModal])

  const handleInsertColumnRight = useCallback(() => {
    if (contextMenu?.columnId) {
      const colIndex = columns.findIndex(c => c.id === contextMenu.columnId)
      if (colIndex >= 0) {
        openNewColumnModal(colIndex + 1)
      }
    } else if (contextMenu?.type === 'index' || contextMenu?.type === 'corner') {
      openNewColumnModal(0)
    }
    setContextMenu(null)
  }, [contextMenu, columns, openNewColumnModal])

  const handleAddRow = useCallback(() => {
    const insertIndex = getRowInsertionIndex()
    doInsertRow(insertIndex)
  }, [getRowInsertionIndex, doInsertRow])

  const handleAddColumn = useCallback(() => {
    const insertIndex = getColumnInsertionIndex()
    openNewColumnModal(insertIndex)
  }, [getColumnInsertionIndex, openNewColumnModal])

  const handleToggleSuggestions = useCallback(() => {
    setShowSuggestions(prev => !prev)
  }, [])

  const handleToggleFilters = useCallback(() => {
    setShowFilterPanel(prev => !prev)
  }, [])

  // Get the autofill source range (either from range selection or single cell)
  const getAutofillSourceRange = useCallback((rowIndex: number, columnId: string): { startRow: number; endRow: number } => {
    // If we have a range selection that includes this column, use that
    if (cellRangeSelection) {
      const colIndex = columns.findIndex(c => c.id === columnId)
      if (colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
        return { startRow: cellRangeSelection.startRow, endRow: cellRangeSelection.endRow }
      }
    }
    // Otherwise use single cell
    return { startRow: rowIndex, endRow: rowIndex }
  }, [cellRangeSelection, columns])

  // Autofill: Start dragging from the fill handle
  const handleAutofillStart = useCallback((rowIndex: number, columnId: string) => {
    if (!isEditable) return
    const sourceRange = getAutofillSourceRange(rowIndex, columnId)
    setAutofillDragging(true)
    setAutofillEndRow(sourceRange.endRow)
    autofillColumnId.current = columnId
    setAutofillPreview([])
  }, [isEditable, getAutofillSourceRange])

  // Autofill: Update while dragging
  const handleAutofillMove = useCallback((targetRowIndex: number) => {
    if (!autofillDragging || !autofillColumnId.current) return
    
    const columnId = autofillColumnId.current
    
    // Get source range
    let sourceStartRow: number
    let sourceEndRow: number
    
    const colIndex = columns.findIndex(c => c.id === columnId)
    if (cellRangeSelection && colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
      sourceStartRow = cellRangeSelection.startRow
      sourceEndRow = cellRangeSelection.endRow
    } else if (selection?.type === 'cell' && selection.columnId === columnId) {
      sourceStartRow = selection.rowIndex
      sourceEndRow = selection.rowIndex
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
  }, [autofillDragging, cellRangeSelection, selection, rows, getDisplayValue])

  // Autofill: End dragging and apply values
  const handleAutofillEnd = useCallback(() => {
    if (!autofillDragging || autofillEndRow === null || !autofillColumnId.current) {
      setAutofillDragging(false)
      setAutofillPreview([])
      return
    }

    const columnId = autofillColumnId.current
    
    // Get source range
    let sourceStartRow: number
    let sourceEndRow: number
    
    const colIndex = columns.findIndex(c => c.id === columnId)
    if (cellRangeSelection && colIndex >= cellRangeSelection.startColIndex && colIndex <= cellRangeSelection.endColIndex) {
      sourceStartRow = cellRangeSelection.startRow
      sourceEndRow = cellRangeSelection.endRow
    } else if (selection?.type === 'cell' && selection.columnId === columnId) {
      sourceStartRow = selection.rowIndex
      sourceEndRow = selection.rowIndex
    } else {
      setAutofillDragging(false)
      setAutofillPreview([])
      return
    }

    const count = autofillEndRow - sourceEndRow

    if (count > 0) {
      // Get all source values from the range
      const sourceValues: CellValue[] = []
      for (let i = sourceStartRow; i <= sourceEndRow; i++) {
        const row = rows[i]
        if (row) {
          const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
          sourceValues.push(value)
        }
      }

      if (sourceValues.length > 0) {
        const pattern = detectPattern(sourceValues)
        const newValues = generateNextValues(pattern, count)

        // Apply values
        saveSnapshot('Autofill')
        newValues.forEach((value, idx) => {
          const targetRow = rows[sourceEndRow + idx + 1]
          if (targetRow) {
            setCellValue(tableId, targetRow.__rowId, columnId, value)
          }
        })
      }
    }

    // Reset state
    setAutofillDragging(false)
    setAutofillEndRow(null)
    setAutofillPreview([])
    autofillColumnId.current = null
  }, [autofillDragging, autofillEndRow, cellRangeSelection, selection, rows, getDisplayValue, saveSnapshot, setCellValue, tableId])

  useEffect(() => {
    if (!autofillDragging) return

    const handleMouseUp = () => {
      handleAutofillEnd()
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [autofillDragging, handleAutofillEnd])

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDraggingSelectionRef.current) {
        handleSelectionMouseUp()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleSelectionMouseUp])

  // Get insertion position description for UI
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

  // Get selected cell data for copy operation
  const getSelectedCellData = useCallback((): GridClipboardData | null => {
    if (!node) return null;
    
    let range: { startRow: number; endRow: number; startColIndex: number; endColIndex: number };
    
    if (cellRangeSelection) {
      range = cellRangeSelection;
    } else if (selection?.type === 'cell') {
      const colIndex = columns.findIndex(c => c.id === selection.columnId);
      if (colIndex < 0) return null;
      range = {
        startRow: selection.rowIndex,
        endRow: selection.rowIndex,
        startColIndex: colIndex,
        endColIndex: colIndex,
      };
    } else {
      return null;
    }
    
    const selectedCols = columns.slice(range.startColIndex, range.endColIndex + 1);
    const headers = selectedCols.map(c => c.name);
    const columnIds = selectedCols.map(c => c.id);
    const dataRows = filteredRows.slice(range.startRow, range.endRow + 1)
      .map(row => selectedCols.map(col => getDisplayValue(row.__rowId, col.id, row[col.id], row)));
    
    return {
      headers,
      columnIds,
      rows: dataRows,
      sourceTableId: tableId,
      sourceTableName: node.name,
      timestamp: Date.now(),
    };
  }, [cellRangeSelection, selection, columns, filteredRows, getDisplayValue, tableId, node]);

  // Format clipboard data as tab-separated text for external paste
  const formatClipboardText = useCallback((data: GridClipboardData): string => {
    const headerRow = data.headers.join('\t');
    const dataRows = data.rows.map(row => 
      row.map(cell => cell === null || cell === undefined ? '' : String(cell)).join('\t')
    );
    return [headerRow, ...dataRows].join('\n');
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Copy handler (Cmd+C / Ctrl+C)
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (cellRangeSelection || selection?.type === 'cell') {
          const data = getSelectedCellData();
          if (data) {
            e.preventDefault();
            // Store structured data for internal paste (report)
            window.__gridClipboard = data;
            // Also copy as text for external paste
            navigator.clipboard.writeText(formatClipboardText(data)).catch(console.error);
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
            // Move to header row
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
            // Move to index column (row number)
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

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">Table not found</p>
      </div>
    )
  }

  // Show error state for tables with errors
  const displayError = materializationError || computationError
  if (displayError) {
    const errorTitle = node.kind === 'derived_table' ? 'Computation Error' : 'Data Loading Error'
    const errorMessage = node.kind === 'derived_table' 
      ? 'Failed to compute this derived table:'
      : 'Failed to load this table:'
    
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <span className="text-sm text-text-secondary">{node.name}</span>
          <div className="flex-1" />
          <span className="badge badge-red">Error</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">{errorTitle}</h3>
            <p className="text-sm text-text-secondary mb-4">
              {errorMessage}
            </p>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-left">
              <code className="text-xs text-red-700 dark:text-red-300 break-all">{displayError}</code>
            </div>
            <button 
              onClick={() => {
                setMaterializationError(null)
                ensureTableMaterialized(tableId)
              }}
              className="mt-4 btn btn-primary"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state for tables being materialized (only if no data loaded yet)
  if ((isMaterializing || isComputing) && (!tableData || !tableData.rows)) {
    const loadingMessage = node.kind === 'derived_table' 
      ? 'Executing transform and loading data...'
      : 'Loading table data...'
    const loadingTitle = node.kind === 'derived_table' ? 'Computing Table' : 'Loading Table'
    
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <span className="text-sm text-text-secondary">{node.name}</span>
          <div className="flex-1" />
          <span className="badge badge-blue animate-pulse">
            {node.kind === 'derived_table' ? 'Computing...' : 'Loading...'}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-green-200 dark:border-green-800"></div>
              <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin"></div>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">{loadingTitle}</h3>
            <p className="text-sm text-text-secondary">
              {loadingMessage}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <GridToolbar
        totalRows={totalRows}
        unfilteredTotalRows={unfilteredTotalRows}
        columnCount={columns.length}
        filters={filters}
        isEditable={isEditable}
        isDirty={isDirty}
        isMaterializing={isMaterializing}
        isComputing={isComputing}
        showFilterPanel={showFilterPanel}
        showSuggestions={showSuggestions}
        highlightedCells={highlightedCells}
        tableId={tableId}
        theme={theme}
        rowInsertionDescription={getRowInsertionDescription()}
        columnInsertionDescription={getColumnInsertionDescription()}
        onAddRow={handleAddRow}
        onAddColumn={handleAddColumn}
        onToggleFilters={handleToggleFilters}
        onToggleSuggestions={handleToggleSuggestions}
        onOpenChartBuilder={() => {
          setChartPreselectedColumn(undefined)
          setChartBuilderOpen(true)
        }}
        onClearHighlights={clearHighlights}
        onToggleTheme={toggleTheme}
      />


      {/* Empty state for new tables */}
      {rows.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-secondary flex items-center justify-center">
              <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Empty Table</h3>
            <p className="text-sm text-text-secondary mb-4">
              This table has no data yet. {isEditable && 'Click "Add Row" to start entering data.'}
            </p>
            {isEditable && (
              <button onClick={handleAddRow} className="btn btn-primary">
                Add First Row
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {rows.length > 0 && (
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto select-none"
          onScroll={handleScroll}
        >
          {/* Calculate total grid width: row number column (50) + all columns + add button (40) */}
          <div style={{ 
            height: totalRows * ROW_HEIGHT + HEADER_HEIGHT, 
            position: 'relative',
            minWidth: 50 + columns.reduce((sum, col) => sum + getColumnWidth(col.id), 0) + (isEditable ? 40 : 0)
          }}>
            {/* Header */}
            <div 
              className="sticky top-0 z-20 flex border-b border-border table-header-bg"
              style={{ height: HEADER_HEIGHT }}
            >
              {/* Corner cell - clickable to select for inserting at position 0,0 */}
              <div 
                onClick={handleCornerClick}
                onContextMenu={(e) => handleContextMenu(e, 'corner')}
                className={`sticky left-0 z-30 flex items-center justify-center px-3 text-xs font-medium border-r border-border cursor-pointer table-header-bg ${
                  isCornerSelected 
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 ring-2 ring-inset ring-green-500' 
                    : 'text-text-tertiary hover:bg-surface-tertiary'
                }`}
                style={{ width: 50, minWidth: 50 }}
                title="Click to insert row/column at beginning"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </div>
              {columns.map((column) => (
                <ColumnHeader
                  key={column.id}
                  column={column}
                  width={getColumnWidth(column.id)}
                  isSelected={selectedColumn === column.id || isHeaderRowSelected}
                  isHeaderRowSelected={isHeaderRowSelected}
                  isEditing={editingColumnId === column.id}
                  editValue={editColumnName}
                  isEditable={isEditable}
                  isResizing={resizingColumn === column.id}
                  isFiltered={filters.conditions.some(c => c.columnId === column.id)}
                  onClick={() => handleColumnClick(column.id)}
                  onDoubleClick={() => handleColumnDoubleClick(column.id, column.name)}
                  onContextMenu={(e) => handleContextMenu(e, 'column', undefined, column.id)}
                  onEditChange={setEditColumnName}
                  onEditCommit={commitColumnNameEdit}
                  onEditCancel={cancelColumnNameEdit}
                  onResizeStart={(e) => handleResizeStart(column.id, e)}
                  onFilterClick={handleToggleFilters}
                />
              ))}
              {/* Add column button at end of header */}
              {isEditable && (
                <div 
                  onClick={() => openNewColumnModal(columns.length)}
                  className="flex items-center justify-center px-2 text-xs cursor-pointer border-l border-border text-text-tertiary hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400"
                  style={{ width: 40, minWidth: 40 }}
                  title="Add column"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              )}
            </div>

            {/* Rows */}
            <div style={{ paddingTop: startIndex * ROW_HEIGHT }}>
              {visibleRows.map((row, idx) => {
                const actualIndex = startIndex + idx
                const isRowSelected = selection?.type === 'row' && selection.rowIndex === actualIndex
                const isCellInRowSelected = selection?.type === 'cell' && selection.rowIndex === actualIndex
                
                return (
                  <div
                    key={row.__rowId}
                    className={`flex border-b border-border-subtle ${
                      actualIndex % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/50'
                    } ${isRowSelected || isIndexColumnSelected ? 'bg-accent-green/10' : ''}`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Row number - clickable to select entire row */}
                    <div 
                      onClick={() => handleRowClick(actualIndex)}
                      onContextMenu={(e) => handleContextMenu(e, 'row', actualIndex)}
                      className={`sticky left-0 z-10 flex items-center justify-center px-3 text-xs border-r border-border-subtle cursor-pointer ${
                        isRowSelected
                          ? 'text-accent-green font-medium !bg-accent-green/15 ring-2 ring-inset ring-accent-green' 
                          : isIndexColumnSelected
                            ? 'text-accent-green !bg-accent-green/10'
                            : 'text-text-tertiary hover:bg-surface-secondary'
                      } ${actualIndex % 2 !== 0 ? 'bg-surface-secondary' : 'bg-surface'}`}
                      style={{ width: 50, minWidth: 50 }}
                      title={`Row ${actualIndex + 1}`}
                    >
                      {actualIndex + 1}
                    </div>
                    
                    {/* Cells */}
                    {columns.map((column) => {
                      const value = getDisplayValue(row.__rowId, column.id, row[column.id], row)
                      const isEditing = editingCell?.rowIndex === actualIndex && editingCell?.columnId === column.id
                      const isCellSelected = selectedCell?.rowIndex === actualIndex && selectedCell?.columnId === column.id
                      const isColumnHighlighted = selection?.type === 'column' && selection.columnId === column.id

                      // Check for autofill preview
                      const autofillPreviewValue = autofillPreview.find(
                        p => p.rowIndex === actualIndex && autofillColumnId.current === column.id
                      )?.value
                      
                      // Get source end row for autofill range check
                      const colIdxForAutofill = columns.findIndex(c => c.id === column.id)
                      const sourceEndRow = cellRangeSelection && colIdxForAutofill >= cellRangeSelection.startColIndex && colIdxForAutofill <= cellRangeSelection.endColIndex
                        ? cellRangeSelection.endRow 
                        : (selection?.type === 'cell' && selection.columnId === column.id ? selection.rowIndex : null)
                      
                      const isInAutofillRange = autofillDragging && 
                        sourceEndRow !== null && 
                        autofillEndRow !== null &&
                        autofillColumnId.current === column.id &&
                        actualIndex > sourceEndRow && 
                        actualIndex <= autofillEndRow
                      
                      // Check if cell is in rectangular range selection
                      const colIndex = columns.findIndex(c => c.id === column.id)
                      const isInCellRange = cellRangeSelection !== null && 
                        actualIndex >= cellRangeSelection.startRow &&
                        actualIndex <= cellRangeSelection.endRow &&
                        colIndex >= cellRangeSelection.startColIndex &&
                        colIndex <= cellRangeSelection.endColIndex

                      // Selection edge detection for border styling
                      const isSelectionTopEdge = isInCellRange && actualIndex === cellRangeSelection!.startRow
                      const isSelectionBottomEdge = isInCellRange && actualIndex === cellRangeSelection!.endRow
                      const isSelectionLeftEdge = isInCellRange && colIndex === cellRangeSelection!.startColIndex
                      const isSelectionRightEdge = isInCellRange && colIndex === cellRangeSelection!.endColIndex

                      // Show fill handle on the bottom-right cell of range selection or on single selected cell
                      const isLastCellOfRange = cellRangeSelection !== null && 
                        actualIndex === cellRangeSelection.endRow && 
                        colIndex === cellRangeSelection.endColIndex
                      const showFillHandleHere = isEditable && !isEditing && (
                        (isCellSelected && !cellRangeSelection) || // Single cell selected
                        isLastCellOfRange // Last cell in range
                      )
                      
                      // Check if cell is highlighted
                      const isCellHighlighted = highlightedCells?.has(`${row.__rowId}:${column.id}`) ?? false

                        return (
                        <GridCell
                          key={column.id}
                          value={value}
                          column={column}
                          width={getColumnWidth(column.id)}
                          rowIndex={actualIndex}
                          isEditing={isEditing}
                          isSelected={isCellSelected || isInCellRange}
                          isColumnSelected={isColumnHighlighted}
                          isRowSelected={isRowSelected || isCellInRowSelected}
                          isEditable={isEditable}
                          isHighlighted={isCellHighlighted}
                          editValue={editValue}
                          editError={isEditing ? editError : null}
                          autofillPreviewValue={autofillPreviewValue}
                          isInAutofillRange={isInAutofillRange}
                          isInCellRange={isInCellRange}
                          isSelectionTopEdge={isSelectionTopEdge}
                          isSelectionBottomEdge={isSelectionBottomEdge}
                          isSelectionLeftEdge={isSelectionLeftEdge}
                          isSelectionRightEdge={isSelectionRightEdge}
                          showFillHandle={showFillHandleHere}
                          onEditChange={setEditValue}
                          onMouseDown={(e) => handleCellMouseDown(actualIndex, column.id, e)}
                          onDoubleClick={() => handleCellDoubleClick(actualIndex, column.id, value)}
                          onContextMenu={(e) => handleContextMenu(e, 'cell', actualIndex, column.id)}
                          onBlur={commitEdit}
                          onFillHandleMouseDown={() => handleAutofillStart(actualIndex, column.id)}
                          onMouseEnter={() => {
                            if (autofillDragging) handleAutofillMove(actualIndex)
                            if (isDraggingSelectionRef.current) handleCellMouseEnter(actualIndex, column.id)
                          }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      <GridContextMenu
        contextMenu={contextMenu}
        filteredRows={filteredRows}
        cellRangeSelection={cellRangeSelection}
        highlightedCells={highlightedCells}
        onInsertRowAbove={handleInsertRowAbove}
        onInsertRowBelow={handleInsertRowBelow}
        onDeleteRow={handleDeleteRow}
        onInsertColumnLeft={handleInsertColumnLeft}
        onInsertColumnRight={handleInsertColumnRight}
        onInsertRowAtBeginning={() => { doInsertRow(0); setContextMenu(null) }}
        onInsertColumnAtBeginning={() => { openNewColumnModal(0); setContextMenu(null) }}
        onToggleHighlight={toggleHighlightForSelection}
        onToggleCellHighlight={toggleCellHighlight}
        onCreateChart={(columnId) => { setChartPreselectedColumn(columnId); setChartBuilderOpen(true) }}
        onClose={() => setContextMenu(null)}
        tableId={tableId}
      />

      {/* Suggestions Panel - Lazy Loaded */}
      {showSuggestions && (
        <Suspense fallback={<div className="fixed right-0 top-0 w-96 h-full bg-surface border-l border-border animate-pulse" />}>
          <SuggestionsPanel
            isOpen={showSuggestions}
            onClose={() => setShowSuggestions(false)}
            tableId={tableId}
            selectedColumnId={selectedColumn ?? undefined}
          />
        </Suspense>
      )}

      {/* Filter Panel */}
      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        columns={columns}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        rows={rows}
        getDisplayValue={getDisplayValue}
        matchingRowCount={totalRows}
        totalRowCount={unfilteredTotalRows}
      />

      {/* New Column Modal with Formula Support */}
      <FormulaColumnModal
        isOpen={newColumnModal.isOpen}
        insertIndex={newColumnModal.insertIndex}
        columns={columns}
        rows={rows.map(row => {
          const rowData: Record<string, FormulaValue> = {}
          columns.forEach(col => {
            rowData[col.id] = getDisplayValue(row.__rowId, col.id, row[col.id], row) as FormulaValue
          })
          return rowData
        })}
        onConfirm={handleNewColumnConfirm}
        onCancel={handleNewColumnCancel}
      />

      {/* Chart Builder Modal - Lazy Loaded */}
      {chartBuilderOpen && (
        <Suspense fallback={
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(2px)',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            <div 
              className="bg-white dark:bg-[#1f1f1f] rounded-2xl p-6 shadow-2xl flex items-center gap-3"
              style={{
                animation: 'scale-in 0.15s ease-out',
                boxShadow: '0 24px 48px rgba(0, 0, 0, 0.15)',
              }}
            >
              <div className="w-5 h-5 border-2 border-gray-200 border-t-[#217346] rounded-full animate-spin" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Loading...</span>
            </div>
          </div>
        }>
          <ChartBuilder
            isOpen={chartBuilderOpen}
            onClose={() => {
              setChartBuilderOpen(false)
              setChartPreselectedColumn(undefined)
            }}
            sourceTableId={tableId}
            preselectedColumn={chartPreselectedColumn}
          />
        </Suspense>
      )}
    </div>
  )
}

