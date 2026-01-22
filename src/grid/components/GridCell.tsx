/**
 * GridCell
 * 
 * Renders a single data cell with editing, selection, and autofill capabilities.
 */

import { useRef, useEffect, useMemo, memo } from 'react'
import type { CellValue, ColumnSchema } from '@/lib/types'
import { formatNumber } from '@/lib/utils'

export interface GridCellProps {
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

function GridCellComponent({
  value,
  column,
  width,
  rowIndex: _rowIndex,
  isEditing,
  isSelected,
  isColumnSelected,
  isRowSelected,
  isEditable,
  isHighlighted,
  editValue,
  editError,
  autofillPreviewValue,
  isInAutofillRange,
  isInCellRange,
  isSelectionTopEdge,
  isSelectionBottomEdge,
  isSelectionLeftEdge,
  isSelectionRightEdge,
  showFillHandle,
  onEditChange,
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  onBlur,
  onFillHandleMouseDown,
  onMouseEnter,
}: GridCellProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const formattedValue = useMemo(() => {
    if (value === null || value === undefined) return ''
    if (column.type === 'number' && typeof value === 'number') {
      return formatNumber(value)
    }
    // Display booleans as "True" / "False"
    if (column.type === 'boolean' || typeof value === 'boolean') {
      if (value === true || value === 'true' || value === 'True') return 'True'
      if (value === false || value === 'false' || value === 'False') return 'False'
    }
    return String(value)
  }, [value, column.type])

  const formattedPreviewValue = useMemo(() => {
    if (autofillPreviewValue === null || autofillPreviewValue === undefined) return ''
    if (column.type === 'number' && typeof autofillPreviewValue === 'number') {
      return formatNumber(autofillPreviewValue)
    }
    // Display booleans as "True" / "False"
    if (column.type === 'boolean' || typeof autofillPreviewValue === 'boolean') {
      if (autofillPreviewValue === true || autofillPreviewValue === 'true' || autofillPreviewValue === 'True') return 'True'
      if (autofillPreviewValue === false || autofillPreviewValue === 'false' || autofillPreviewValue === 'False') return 'False'
    }
    return String(autofillPreviewValue)
  }, [autofillPreviewValue, column.type])

  const isFormulaColumn = column.isComputed

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      className={`
        relative flex items-center px-2 text-sm overflow-hidden box-border
        ${isEditable && !isFormulaColumn ? 'cursor-cell' : 'cursor-default'}
        ${isHighlighted && !isSelected && !isInCellRange ? 'bg-emerald-100 dark:bg-emerald-900/50 outline outline-2 outline-emerald-500' : ''}
        ${isSelected && !isInCellRange && !editError ? 'bg-accent-green/20 dark:bg-accent-green/30 outline outline-2 outline-accent-green' : ''}
        ${isInCellRange ? 'bg-accent-green/20 dark:bg-accent-green/30' : ''}
        ${editError ? 'outline outline-2 outline-red-500 bg-red-50 dark:bg-red-900/30' : ''}
        ${isInAutofillRange ? 'bg-accent-green/10 dark:bg-accent-green/20' : ''}
        ${(isColumnSelected || isRowSelected) && !isSelected && !isInAutofillRange && !isInCellRange && !isHighlighted ? 'bg-accent-green/5 dark:bg-accent-green/10' : ''}
        ${column.type === 'number' ? 'justify-end font-mono' : ''}
        ${isFormulaColumn && !isSelected && !isInCellRange && !isHighlighted ? 'bg-purple-50/30 dark:bg-purple-900/10' : ''}
        ${isEditable && !isEditing && !isSelected && !isInCellRange && !isFormulaColumn && !isHighlighted ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''}
        ${!isInCellRange && !isSelected && !isHighlighted ? 'border-r border-border-subtle' : ''}
        ${isSelectionTopEdge ? 'border-t-2 border-t-accent-green' : ''}
        ${isSelectionBottomEdge ? 'border-b-2 border-b-accent-green' : ''}
        ${isSelectionLeftEdge ? 'border-l-2 border-l-accent-green' : ''}
        ${isSelectionRightEdge ? 'border-r-2 border-r-accent-green' : ''}
      `}
      style={{ width, minWidth: width, maxWidth: width }}
      title={isFormulaColumn ? `Computed: ${column.formula}` : undefined}
    >
      {isEditing ? (
        <div className="absolute inset-0 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onBlur}
            className={`w-full h-full px-2 border-none outline-none text-sm bg-transparent ${
              column.type === 'number' ? 'text-right font-mono' : ''
            } ${editError ? 'text-red-700 dark:text-red-300' : 'text-text-primary'}`}
          />
          {editError && (
            <div className="absolute left-0 top-full mt-1 z-20 px-2 py-1 bg-red-500 text-white text-xs rounded shadow-lg whitespace-nowrap">
              {editError}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Show preview value if in autofill range, otherwise actual value */}
          {isInAutofillRange && autofillPreviewValue !== undefined ? (
            <span className="truncate w-full text-green-400 dark:text-green-300 italic">
              {formattedPreviewValue || '(empty)'}
            </span>
          ) : (
            <span className={`truncate w-full ${value === null || value === undefined || value === '' ? 'text-text-tertiary italic' : ''}`}>
              {value === null || value === undefined || value === '' ? '(empty)' : formattedValue}
            </span>
          )}
          
          {/* Fill handle - small square at bottom-right corner */}
          {showFillHandle && (
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onFillHandleMouseDown?.()
              }}
              className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 cursor-crosshair z-10 hover:bg-green-600"
              style={{ transform: 'translate(50%, 50%)' }}
              title="Drag to fill cells below"
            />
          )}
        </>
      )}
    </div>
  )
}

// Memoized with custom comparison for performance
export const GridCell = memo(GridCellComponent, (prevProps, nextProps) => {
  // Skip re-render if key props haven't changed
  return (
    prevProps.value === nextProps.value &&
    prevProps.width === nextProps.width &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isColumnSelected === nextProps.isColumnSelected &&
    prevProps.isRowSelected === nextProps.isRowSelected &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.editValue === nextProps.editValue &&
    prevProps.editError === nextProps.editError &&
    prevProps.autofillPreviewValue === nextProps.autofillPreviewValue &&
    prevProps.isInAutofillRange === nextProps.isInAutofillRange &&
    prevProps.isInCellRange === nextProps.isInCellRange &&
    prevProps.isSelectionTopEdge === nextProps.isSelectionTopEdge &&
    prevProps.isSelectionBottomEdge === nextProps.isSelectionBottomEdge &&
    prevProps.isSelectionLeftEdge === nextProps.isSelectionLeftEdge &&
    prevProps.isSelectionRightEdge === nextProps.isSelectionRightEdge &&
    prevProps.showFillHandle === nextProps.showFillHandle
  )
})
