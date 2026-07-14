import { useRef, useEffect } from 'react'
import type { ColumnSchema } from '@/types'
import { HEADER_HEIGHT, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from './constants'
import { useGridContext } from './useGridContext'

interface ColumnHeaderProps {
  column: ColumnSchema
  columnIndex: number
}

export function ColumnHeader({ column, columnIndex }: ColumnHeaderProps) {
  const {
    isEditable,
    getColumnWidth,
    selectedColumn,
    isHeaderRowSelected,
    editingColumnId,
    editColumnName,
    setEditColumnName,
    commitColumnNameEdit,
    cancelColumnNameEdit,
    handleColumnClick,
    handleColumnDoubleClick,
    handleContextMenu,
    openContextMenu,
    resizingColumn,
    handleResizeStart,
    resizeColumnBy,
    setColumnWidth,
    filters,
    handleToggleFilters,
  } = useGridContext()

  const inputRef = useRef<HTMLInputElement>(null)
  const width = getColumnWidth(column.id)
  const isSelected = selectedColumn === column.id || isHeaderRowSelected
  const isEditing = editingColumnId === column.id
  const isResizing = resizingColumn === column.id
  const isFiltered = filters.conditions.some(c => c.columnId === column.id)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitColumnNameEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelColumnNameEdit()
    }
  }

  const headerStateClass = isResizing
    ? 'bg-accent-green/20 text-accent-text'
    : isSelected || isHeaderRowSelected
      ? 'bg-accent-green/10 text-accent-text'
      : 'text-text-secondary hover:bg-surface-tertiary'

  return (
    <div
      role="columnheader"
      aria-colindex={columnIndex}
      aria-selected={isSelected}
      tabIndex={0}
      onClick={() => handleColumnClick(column.id)}
      onDoubleClick={() => handleColumnDoubleClick(column.id, column.name)}
      onKeyDown={(event) => {
        if (isEditing) return
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          openContextMenu(rect.left + 16, rect.top + 16, 'column', undefined, column.id)
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleColumnClick(column.id)
        } else if (event.key === 'F2' && isEditable) {
          event.preventDefault()
          handleColumnDoubleClick(column.id, column.name)
        }
      }}
      onContextMenu={(e) => handleContextMenu(e, 'column', undefined, column.id)}
      className={`
        relative flex items-center gap-1 px-2 text-xs font-medium cursor-pointer select-none
        border-r border-border group transition-colors
        ${headerStateClass}
      `}
      style={{ width, minWidth: width, maxWidth: width, height: HEADER_HEIGHT }}
      title={isEditable ? `"${column.name}" - Double-click to rename, drag edge to resize` : `"${column.name}"`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editColumnName}
          onChange={(e) => setEditColumnName(e.target.value)}
          onBlur={commitColumnNameEdit}
          onKeyDown={handleKeyDown}
          aria-label={`Rename ${column.name} column`}
          className="absolute inset-0 w-full h-full px-2 text-xs font-medium bg-transparent outline-none border-none text-text-primary"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="truncate flex-1 min-w-0">{column.name}</span>
          {column.isComputed && (
            <span
              className="px-1 py-0.5 text-xs font-mono bg-accent-purple/10 text-node-derived-text rounded flex-shrink-0"
              title={`Formula: ${column.formula}`}
            >
              fx
            </span>
          )}
          {isFiltered && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleToggleFilters()
              }}
              className="column-filter-trigger inline-flex flex-shrink-0 items-center justify-center p-0.5 text-accent-text hover:text-accent-green"
              title={`Column "${column.name}" is filtered`}
              aria-label={`Edit filter for ${column.name}`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          )}
          <span className="flex-shrink-0 font-mono text-xs uppercase text-text-tertiary">
            {column.type}
          </span>
        </>
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${column.name} column`}
        aria-valuemin={MIN_COLUMN_WIDTH}
        aria-valuemax={MAX_COLUMN_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onMouseDown={(e) => handleResizeStart(column.id, e)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 25 : 10
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            event.stopPropagation()
            resizeColumnBy(column.id, -step)
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            event.stopPropagation()
            resizeColumnBy(column.id, step)
          } else if (event.key === 'Home') {
            event.preventDefault()
            event.stopPropagation()
            setColumnWidth(column.id, MIN_COLUMN_WIDTH)
          } else if (event.key === 'End') {
            event.preventDefault()
            event.stopPropagation()
            setColumnWidth(column.id, MAX_COLUMN_WIDTH)
          }
        }}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-green/50 focus:bg-accent-green/50 transition-colors z-10"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
