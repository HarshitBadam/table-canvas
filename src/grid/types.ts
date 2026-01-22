/**
 * Grid Types
 * 
 * Shared type definitions for the grid components.
 */

import type { CellValue, ColumnSchema, FilterCondition } from '@/types'

// ============================================================================
// Constants
// ============================================================================

/** Height of each row in pixels */
export const ROW_HEIGHT = 36

/** Height of the header row in pixels */
export const HEADER_HEIGHT = 44

/** Number of rows to render above/below viewport */
export const BUFFER_ROWS = 10

/** Default column width */
export const DEFAULT_COLUMN_WIDTH = 150

/** Minimum column width */
export const MIN_COLUMN_WIDTH = 60

/** Maximum column width */
export const MAX_COLUMN_WIDTH = 500

// ============================================================================
// Row Types
// ============================================================================

/** Row with dynamic column access */
export interface GridRow {
  /** Unique row identifier */
  __rowId: string
  /** Column values by ID */
  [columnId: string]: CellValue
}

// ============================================================================
// Selection Types
// ============================================================================

/** Types of selection that can occur in the grid */
export type SelectionType =
  | { type: 'cell'; rowIndex: number; columnId: string }
  | { type: 'row'; rowIndex: number }
  | { type: 'column'; columnId: string }
  | { type: 'header-row' }
  | { type: 'index-column' }
  | { type: 'corner' }
  | null

/** Rectangular cell range selection (Excel-style) */
export interface CellRangeSelection {
  startRow: number
  endRow: number
  startColIndex: number
  endColIndex: number
}

// ============================================================================
// Context Menu Types
// ============================================================================

/** Types of context menu locations */
export type ContextMenuType = 'cell' | 'row' | 'column' | 'header' | 'index' | 'corner'

/** Context menu state */
export interface ContextMenuState {
  /** X position in viewport */
  x: number
  /** Y position in viewport */
  y: number
  /** Type of context menu */
  type: ContextMenuType
  /** Row index (if applicable) */
  rowIndex?: number
  /** Column ID (if applicable) */
  columnId?: string
}

// ============================================================================
// Autofill Types
// ============================================================================

/** Autofill preview entry */
export interface AutofillPreviewEntry {
  rowIndex: number
  value: CellValue
}

// ============================================================================
// Filter Types
// ============================================================================

/** Grid filter configuration */
export interface GridFilterConfig {
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}

// ============================================================================
// Component Props Types
// ============================================================================

/** Props for ColumnHeader component */
export interface ColumnHeaderProps {
  column: ColumnSchema
  width: number
  isSelected: boolean
  isHeaderRowSelected: boolean
  isEditing: boolean
  editValue: string
  isEditable: boolean
  isResizing: boolean
  isFiltered: boolean
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onEditChange: (value: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onResizeStart: (e: React.MouseEvent) => void
  onFilterClick: () => void
}

/** Props for Cell component */
export interface CellProps {
  value: CellValue
  column: ColumnSchema
  width: number
  rowIndex: number
  isEditing: boolean
  isSelected: boolean
  isColumnSelected: boolean
  isRowSelected: boolean
  isEditable: boolean
  isHighlighted?: boolean
  editValue: string
  editError: string | null
  autofillPreviewValue?: CellValue
  isInAutofillRange?: boolean
  isInCellRange?: boolean
  isSelectionTopEdge?: boolean
  isSelectionBottomEdge?: boolean
  isSelectionLeftEdge?: boolean
  isSelectionRightEdge?: boolean
  showFillHandle?: boolean
  onEditChange: (value: string) => void
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onBlur: () => void
  onFillHandleMouseDown?: () => void
  onMouseEnter?: () => void
}
