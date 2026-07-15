import { useRef, useEffect, useId, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
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
    selectEditValue,
    setEditValue,
    commitEdit,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellDoubleClick,
    handleContextMenu,
    openContextMenu,
    autofillDragging,
    autofillEndRow,
    autofillPreview,
    autofillColumnId,
    handleAutofillStart,
    handleAutofillMove,
    handleAutofillOneRow,
    highlightedCells,
    isDraggingSelectionRef,
    columns,
    setSelection,
  } = useGridContext()

  const inputRef = useRef<HTMLInputElement>(null)
  const cellRef = useRef<HTMLDivElement>(null)
  const editErrorId = useId()
  const [editErrorPosition, setEditErrorPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const width = getColumnWidth(column.id)
  const value = getDisplayValue(row.__rowId, column.id, row[column.id], row)
  const isFormulaColumn = column.isComputed

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
  ) && !isFormulaColumn

  const isCellHighlighted = highlightedCells?.has(`${row.__rowId}:${column.id}`) ?? false
  const isSelected = isCellSelected || isInCellRange

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      if (selectEditValue) {
        inputRef.current.select()
      } else {
        const end = inputRef.current.value.length
        inputRef.current.setSelectionRange(end, end)
      }
    }
  }, [isEditing, selectEditValue])

  useEffect(() => {
    if (isCellSelected && !isEditing) {
      cellRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
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

  const currentEditError = isEditing ? editError : null
  const isEmptyValue = value === null || value === undefined || value === ''

  useLayoutEffect(() => {
    if (!currentEditError || !inputRef.current) {
      setEditErrorPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect()
      if (!rect) return
      const tooltipWidth = Math.min(Math.max(rect.width, 180), 280)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - tooltipWidth - 8))
      const top = rect.bottom + 6 <= window.innerHeight - 48 ? rect.bottom + 6 : rect.top - 42
      setEditErrorPosition({ left, top, width: tooltipWidth })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [currentEditError])

  return (
    <>
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
        onMouseDown={(e) => {
          handleCellMouseDown(rowIndex, column.id, e)
          if (e.button === 0) cellRef.current?.focus({ preventScroll: true })
        }}
        onDoubleClick={() => handleCellDoubleClick(rowIndex, column.id, value)}
        onContextMenu={(e) => handleContextMenu(e, 'cell', rowIndex, column.id)}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          openContextMenu(rect.left + 16, rect.top + 16, 'cell', rowIndex, column.id)
        }}
        onMouseEnter={() => {
          if (autofillDragging) handleAutofillMove(rowIndex)
          if (isDraggingSelectionRef.current) handleCellMouseEnter(rowIndex, column.id)
        }}
        className={`
          grid-cell relative flex items-center px-2 text-sm box-border
          ${isSelected || isCellHighlighted || currentEditError ? 'z-10' : ''}
          ${isEditable && !isFormulaColumn ? 'cursor-cell' : 'cursor-default'}
          ${isCellHighlighted && !isSelected ? 'bg-accent-green/10' : ''}
          ${isSelected && !isInCellRange && !currentEditError ? 'bg-accent-green/20 dark:bg-accent-green/30' : ''}
          ${isInCellRange ? 'bg-accent-green/20 dark:bg-accent-green/30' : ''}
          ${currentEditError ? 'bg-error-light' : ''}
          ${isInAutofillRange ? 'bg-accent-green/10 dark:bg-accent-green/20' : ''}
          ${(isColumnHighlighted || isRowSelected || isCellInRowSelected) && !isSelected && !isInAutofillRange && !isInCellRange && !isCellHighlighted ? 'bg-accent-green/5 dark:bg-accent-green/10' : ''}
          ${column.type === 'number' ? 'justify-end font-mono' : ''}
          ${isFormulaColumn && !isSelected && !isInCellRange && !isCellHighlighted ? 'bg-purple-50/30 dark:bg-purple-900/10' : ''}
          ${isEditable && !isEditing && !isSelected && !isInCellRange && !isFormulaColumn && !isCellHighlighted ? 'hover:bg-surface-secondary' : ''}
          ${!isInCellRange && !isSelected && !isCellHighlighted ? 'border-r border-border-subtle' : ''}
        `}
        style={{ width, minWidth: width, maxWidth: width }}
        title={isFormulaColumn ? `Computed: ${column.formula}` : undefined}
      >
      {(isSelected || isCellHighlighted || currentEditError) && (
        <span
          aria-hidden="true"
          className={`
            pointer-events-none absolute inset-0 z-10
            ${currentEditError ? 'border-2 border-error' : ''}
            ${!currentEditError && (isCellSelected || isCellHighlighted) && !isInCellRange ? 'border-2 border-accent-green' : ''}
            ${!currentEditError && isSelectionTopEdge ? 'border-t-2 border-t-accent-green' : ''}
            ${!currentEditError && isSelectionBottomEdge ? 'border-b-2 border-b-accent-green' : ''}
            ${!currentEditError && isSelectionLeftEdge ? 'border-l-2 border-l-accent-green' : ''}
            ${!currentEditError && isSelectionRightEdge ? 'border-r-2 border-r-accent-green' : ''}
          `}
        />
      )}
      {isEditing ? (
        <div className="absolute inset-0 flex items-center">
          <input
            ref={inputRef}
            type="text"
            aria-label={`Edit ${column.name}, row ${rowIndex + 1}`}
            aria-invalid={Boolean(currentEditError)}
            aria-describedby={currentEditError ? editErrorId : undefined}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => {
              if (!commitEdit()) {
                requestAnimationFrame(() => inputRef.current?.focus())
              }
            }}
            onMouseDown={(event) => event.stopPropagation()}
            className={`w-full h-full px-2 border-none outline-none text-sm bg-transparent ${
              column.type === 'number' ? 'text-right font-mono' : ''
            } ${currentEditError ? 'text-error-text' : 'text-text-primary'}`}
          />
        </div>
      ) : (
        <>
          {isInAutofillRange && autofillPreviewValue !== undefined ? (
            <span className="truncate w-full text-accent-text italic">
              {formattedPreviewValue || 'Clear'}
            </span>
          ) : (
            <span className="w-full truncate">
              {!isEmptyValue ? formattedValue : null}
            </span>
          )}

          {showFillHandle && (
            <button
              type="button"
              aria-label={`Fill ${column.name} down one row`}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleAutofillStart(rowIndex, column.id)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                handleAutofillOneRow(rowIndex, column.id)
              }}
              className="grid-autofill-handle group absolute bottom-0 right-0 z-20 h-3 w-3 cursor-crosshair bg-transparent p-0"
              style={{ transform: 'translate(50%, 50%)' }}
              title="Drag to fill cells below, or press Enter to fill one row"
            >
              <span
                aria-hidden="true"
                className="absolute bottom-0 right-0 h-2.5 w-2.5 border border-surface bg-accent-green transition-colors group-hover:bg-accent-green-hover"
              />
            </button>
          )}
        </>
      )}
      </div>
      {currentEditError && editErrorPosition && createPortal(
        <div
          id={editErrorId}
          role="alert"
          className="fixed z-tooltip rounded border border-error/30 bg-error-light px-2 py-1.5 text-xs text-error-text shadow-md"
          style={editErrorPosition}
        >
          {currentEditError}
        </div>,
        document.body,
      )}
    </>
  )
}
