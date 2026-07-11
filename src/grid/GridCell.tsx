import { useRef, useEffect, useMemo } from 'react'
import type { ColumnSchema } from '@/types'
import { formatNumber } from '@/lib/utils'
import { useGridContext } from './useGridContext'
import type { GridRow } from './types'

interface GridCellProps {
  column: ColumnSchema
  row: GridRow
  rowIndex: number
}

export function GridCell({
  column,
  row,
  rowIndex,
}: GridCellProps) {
  const {
    isEditable,
    getDisplayValue,
    getColumnWidth,
    selectedCell,
    selection,
    cellRangeSelection,
    editingCell,
    editValue,
    editError,
    setEditValue,
    commitEdit,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellDoubleClick,
    handleContextMenu,
    autofillDragging,
    autofillEndRow,
    autofillPreview,
    autofillColumnId,
    handleAutofillStart,
    handleAutofillMove,
    highlightedCells,
    isDraggingSelectionRef,
    columns,
    setSelection,
  } = useGridContext()

  const inputRef = useRef<HTMLInputElement>(null)
  const cellRef = useRef<HTMLDivElement>(null)
  const width = getColumnWidth(column.id)
  const value = getDisplayValue(row.__rowId, column.id, row[column.id], row)

  const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnId === column.id
  const isCellSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.columnId === column.id
  const isColumnHighlighted = selection?.type === 'column' && selection.columnId === column.id
  const isRowSelected = selection?.type === 'row' && selection.rowIndex === rowIndex
  const isCellInRowSelected = selection?.type === 'cell' && selection.rowIndex === rowIndex

  const colIndex = columns.findIndex(c => c.id === column.id)
  const isInCellRange = cellRangeSelection !== null &&
    rowIndex >= cellRangeSelection.startRow &&
    rowIndex <= cellRangeSelection.endRow &&
    colIndex >= cellRangeSelection.startColIndex &&
    colIndex <= cellRangeSelection.endColIndex

  const isSelectionTopEdge = isInCellRange && rowIndex === cellRangeSelection!.startRow
  const isSelectionBottomEdge = isInCellRange && rowIndex === cellRangeSelection!.endRow
  const isSelectionLeftEdge = isInCellRange && colIndex === cellRangeSelection!.startColIndex
  const isSelectionRightEdge = isInCellRange && colIndex === cellRangeSelection!.endColIndex

  const autofillPreviewValue = autofillPreview.find(
    p => p.rowIndex === rowIndex && autofillColumnId.current === column.id
  )?.value

  const colIdxForAutofill = columns.findIndex(c => c.id === column.id)
  const sourceEndRow = cellRangeSelection && colIdxForAutofill >= cellRangeSelection.startColIndex && colIdxForAutofill <= cellRangeSelection.endColIndex
    ? cellRangeSelection.endRow
    : (selection?.type === 'cell' && selection.columnId === column.id ? selection.rowIndex : null)

  const isInAutofillRange = autofillDragging &&
    sourceEndRow !== null &&
    autofillEndRow !== null &&
    autofillColumnId.current === column.id &&
    rowIndex > sourceEndRow &&
    rowIndex <= autofillEndRow

  const isLastCellOfRange = cellRangeSelection !== null &&
    rowIndex === cellRangeSelection.endRow &&
    colIndex === cellRangeSelection.endColIndex
  const showFillHandle = isEditable && !isEditing && (
    (isCellSelected && !cellRangeSelection) ||
    isLastCellOfRange
  )

  const isCellHighlighted = highlightedCells?.has(`${row.__rowId}:${column.id}`) ?? false
  const isSelected = isCellSelected || isInCellRange

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (
      isCellSelected
      && !isEditing
      && document.activeElement?.closest('[role="grid"]')
    ) {
      cellRef.current?.focus()
    }
  }, [isCellSelected, isEditing])

  const formattedValue = useMemo(() => {
    if (value === null || value === undefined) return ''
    if (column.type === 'number' && typeof value === 'number') {
      return formatNumber(value)
    }
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
    if (column.type === 'boolean' || typeof autofillPreviewValue === 'boolean') {
      if (autofillPreviewValue === true || autofillPreviewValue === 'true' || autofillPreviewValue === 'True') return 'True'
      if (autofillPreviewValue === false || autofillPreviewValue === 'false' || autofillPreviewValue === 'False') return 'False'
    }
    return String(autofillPreviewValue)
  }, [autofillPreviewValue, column.type])

  const isFormulaColumn = column.isComputed
  const currentEditError = isEditing ? editError : null

  return (
    <div
      ref={cellRef}
      role="gridcell"
      aria-colindex={colIndex + 2}
      aria-rowindex={rowIndex + 2}
      aria-selected={isSelected}
      aria-readonly={!isEditable || Boolean(isFormulaColumn)}
      aria-label={`${column.name}, row ${rowIndex + 1}: ${formattedValue || 'empty'}`}
      tabIndex={isCellSelected || (!selectedCell && rowIndex === 0 && colIndex === 0) ? 0 : -1}
      onFocus={() => {
        if (!isCellSelected) {
          setSelection({ type: 'cell', rowIndex, columnId: column.id })
        }
      }}
      onMouseDown={(e) => handleCellMouseDown(rowIndex, column.id, e)}
      onDoubleClick={() => handleCellDoubleClick(rowIndex, column.id, value)}
      onContextMenu={(e) => handleContextMenu(e, 'cell', rowIndex, column.id)}
      onMouseEnter={() => {
        if (autofillDragging) handleAutofillMove(rowIndex)
        if (isDraggingSelectionRef.current) handleCellMouseEnter(rowIndex, column.id)
      }}
      className={`
        relative flex items-center px-2 text-sm overflow-hidden box-border
        ${isEditable && !isFormulaColumn ? 'cursor-cell' : 'cursor-default'}
        ${isCellHighlighted && !isSelected ? 'bg-emerald-100 dark:bg-emerald-900/50 outline outline-2 outline-emerald-500' : ''}
        ${isSelected && !isInCellRange && !currentEditError ? 'bg-accent-green/20 dark:bg-accent-green/30 outline outline-2 outline-accent-green' : ''}
        ${isInCellRange ? 'bg-accent-green/20 dark:bg-accent-green/30' : ''}
        ${currentEditError ? 'outline outline-2 outline-red-500 bg-red-50 dark:bg-red-900/30' : ''}
        ${isInAutofillRange ? 'bg-accent-green/10 dark:bg-accent-green/20' : ''}
        ${(isColumnHighlighted || isRowSelected || isCellInRowSelected) && !isSelected && !isInAutofillRange && !isInCellRange && !isCellHighlighted ? 'bg-accent-green/5 dark:bg-accent-green/10' : ''}
        ${column.type === 'number' ? 'justify-end font-mono' : ''}
        ${isFormulaColumn && !isSelected && !isInCellRange && !isCellHighlighted ? 'bg-purple-50/30 dark:bg-purple-900/10' : ''}
        ${isEditable && !isEditing && !isSelected && !isInCellRange && !isFormulaColumn && !isCellHighlighted ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''}
        ${!isInCellRange && !isSelected && !isCellHighlighted ? 'border-r border-border-subtle' : ''}
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
            aria-label={`Edit ${column.name}, row ${rowIndex + 1}`}
            aria-invalid={Boolean(currentEditError)}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            className={`w-full h-full px-2 border-none outline-none text-sm bg-transparent ${
              column.type === 'number' ? 'text-right font-mono' : ''
            } ${currentEditError ? 'text-red-700 dark:text-red-300' : 'text-text-primary'}`}
          />
          {currentEditError && (
            <div
              role="alert"
              className="absolute left-0 top-full mt-1 z-20 px-2 py-1 bg-red-500 text-white text-xs rounded shadow-lg whitespace-nowrap"
            >
              {currentEditError}
            </div>
          )}
        </div>
      ) : (
        <>
          {isInAutofillRange && autofillPreviewValue !== undefined ? (
            <span className="truncate w-full text-green-400 dark:text-green-300 italic">
              {formattedPreviewValue || '(empty)'}
            </span>
          ) : (
            <span className={`truncate w-full ${value === null || value === undefined || value === '' ? 'text-text-tertiary italic' : ''}`}>
              {value === null || value === undefined || value === '' ? '(empty)' : formattedValue}
            </span>
          )}

          {showFillHandle && (
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleAutofillStart(rowIndex, column.id)
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
