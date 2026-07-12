import type { CellValue, ColumnSchema } from '@/types'
import type { GridRow, SelectionType, ContextMenuState } from './types'
import type { CellRangeSelection } from './useGridSelection'
import { gridContext } from './gridContextStore'

export interface GridContextValue {
  tableId: string
  isEditable: boolean

  columns: ColumnSchema[]
  getDisplayValue: (rowId: string, columnId: string, baseValue: CellValue, row?: GridRow) => CellValue
  getColumnWidth: (columnId: string) => number

  selection: SelectionType
  selectedCell: { rowIndex: number; columnId: string } | null
  selectedColumn: string | null
  isHeaderRowSelected: boolean
  isIndexColumnSelected: boolean
  isCornerSelected: boolean
  cellRangeSelection: CellRangeSelection | null
  setSelection: (selection: SelectionType) => void
  handleCellMouseDown: (rowIndex: number, columnId: string, e: React.MouseEvent) => void
  handleCellMouseEnter: (rowIndex: number, columnId: string) => void
  handleColumnClick: (columnId: string) => void
  handleRowClick: (rowIndex: number) => void
  handleCornerClick: () => void
  toggleHighlightForSelection: () => void
  isDraggingSelectionRef: React.MutableRefObject<boolean>

  editingColumnId: string | null
  editColumnName: string
  setEditColumnName: (value: string) => void
  commitColumnNameEdit: () => void
  cancelColumnNameEdit: () => void
  handleColumnDoubleClick: (columnId: string, currentName: string) => void

  editingCell: { rowIndex: number; columnId: string } | null
  editValue: string
  editError: string | null
  setEditValue: (v: string) => void
  startEditing: (rowIndex: number, columnId: string, currentValue: CellValue) => void
  commitEdit: () => void
  cancelEdit: () => void

  handleContextMenu: (
    e: React.MouseEvent,
    type: 'cell' | 'row' | 'column' | 'header' | 'index' | 'corner',
    rowIndex?: number,
    columnId?: string
  ) => void
  contextMenu: ContextMenuState | null
  filteredRows: GridRow[]
  closeContextMenu: () => void
  onInsertRowAbove: () => void
  onInsertRowBelow: () => void
  onDeleteRow: () => void
  onInsertColumnLeft: () => void
  onInsertColumnRight: () => void
  onInsertRowAtBeginning: () => void
  onInsertColumnAtBeginning: () => void
  onToggleCellHighlight: (tableId: string, rowId: string, columnId: string) => void
  onCreateChart: (columnId: string) => void

  autofillDragging: boolean
  autofillEndRow: number | null
  autofillPreview: { rowIndex: number; value: CellValue }[]
  autofillColumnId: React.MutableRefObject<string | null>
  handleAutofillStart: (rowIndex: number, columnId: string) => void
  handleAutofillMove: (targetRowIndex: number) => void
  handleAutofillOneRow: (rowIndex: number, columnId: string) => void

  filters: { conditions: { columnId: string }[] }
  handleToggleFilters: () => void

  resizingColumn: string | null
  handleResizeStart: (columnId: string, e: React.MouseEvent) => void
  resizeColumnBy: (columnId: string, delta: number) => void
  setColumnWidth: (columnId: string, width: number) => void

  highlightedCells: Set<string> | undefined

  handleAddRow: () => void

  handleCellDoubleClick: (rowIndex: number, columnId: string, currentValue: CellValue) => void
}

export function GridProvider({ children, value }: { children: React.ReactNode; value: GridContextValue }) {
  return <gridContext.Provider value={value}>{children}</gridContext.Provider>
}
