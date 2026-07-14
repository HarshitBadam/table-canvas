import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ColumnHeader } from './ColumnHeader'
import { GridCell } from './GridCell'
import { HEADER_HEIGHT, ROW_HEIGHT, TOUCH_ROW_HEIGHT } from './constants'
import { useGridContext } from './useGridContext'
import type { WindowedRowsState } from './hooks/useWindowedRows'

const TOUCH_ROW_QUERY = '(max-width: 767px), (pointer: coarse)'

interface GridViewportProps {
  totalRows: number
  windowed: WindowedRowsState
  onAddColumn: () => void
}

export function GridViewport({ totalRows, windowed, onAddColumn }: GridViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(TOUCH_ROW_QUERY).matches
      ? TOUCH_ROW_HEIGHT
      : ROW_HEIGHT
  )
  const { ensureRange, isLoading, totalRows: windowedTotalRows } = windowed
  const {
    columns, filteredRows, getColumnWidth, isEditable, isCornerSelected, selection,
    isIndexColumnSelected, handleCornerClick, handleContextMenu, handleRowClick,
    openContextMenu,
  } = useGridContext()
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const firstVisibleIndex = virtualRows[0]?.index ?? 0
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? 0

  useEffect(() => {
    const query = window.matchMedia(TOUCH_ROW_QUERY)
    const updateRowHeight = () => setRowHeight(query.matches ? TOUCH_ROW_HEIGHT : ROW_HEIGHT)
    updateRowHeight()
    query.addEventListener('change', updateRowHeight)
    return () => query.removeEventListener('change', updateRowHeight)
  }, [])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [rowHeight, rowVirtualizer])

  useEffect(() => {
    if (windowedTotalRows > 0) ensureRange(firstVisibleIndex, lastVisibleIndex)
  }, [ensureRange, firstVisibleIndex, lastVisibleIndex, windowedTotalRows])

  if (totalRows === 0 && !isLoading) return null

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label="Table data"
      aria-rowcount={totalRows + 1}
      aria-colcount={columns.length + 1}
      className="flex-1 overflow-auto select-none"
    >
      <div style={{
        height: rowVirtualizer.getTotalSize() + HEADER_HEIGHT,
        position: 'relative',
        minWidth: 50 + columns.reduce((sum, column) => sum + getColumnWidth(column.id), 0) + (isEditable ? 40 : 0),
      }}>
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-sticky flex border-b border-border bg-surface-secondary"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            role="columnheader"
            aria-colindex={1}
            tabIndex={0}
            onClick={handleCornerClick}
            onKeyDown={(event) => {
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                event.preventDefault()
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                openContextMenu(rect.left + 16, rect.top + 16, 'corner')
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleCornerClick()
              }
            }}
            onContextMenu={(event) => handleContextMenu(event, 'corner')}
            className={`sticky left-0 z-fixed flex cursor-pointer items-center justify-center border-r border-border bg-surface-secondary px-3 text-xs font-medium transition-colors ${
              isCornerSelected ? '!bg-accent-green/10 text-accent-text ring-2 ring-inset ring-accent-green' : 'text-text-tertiary hover:bg-surface-tertiary'
            }`}
            style={{ width: 50, minWidth: 50 }}
            title="Click to insert row/column at beginning"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </div>
          {columns.map((column, index) => (
            <ColumnHeader key={column.id} column={column} columnIndex={index + 2} />
          ))}
          {isEditable && (
            <div role="columnheader" aria-label="Table actions">
              <button type="button" onClick={onAddColumn} aria-label="Add column" className="flex cursor-pointer items-center justify-center border-l border-border px-2 text-xs text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-accent-text" style={{ width: 40, minWidth: 40, height: '100%' }} title="Add column">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          )}
        </div>
        <div style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}>
          {virtualRows.map(virtualRow => {
            const index = virtualRow.index
            const row = filteredRows[index]
            const rowStyle = { position: 'absolute' as const, top: virtualRow.start, height: rowHeight, width: '100%' }
            if (!row) {
              return <div key={`skeleton-${index}`} role="row" aria-rowindex={index + 2} className="flex border-b border-border-subtle bg-surface animate-pulse" style={rowStyle}>
                <div role="rowheader" aria-colindex={1} className="sticky left-0 z-10 flex items-center justify-center px-3 text-xs border-r border-border-subtle text-text-tertiary bg-surface" style={{ width: 50, minWidth: 50 }}>{index + 1}</div>
                {columns.map(column => <div key={column.id} className="flex items-center px-3" style={{ width: getColumnWidth(column.id) }}><div className="h-4 bg-surface-secondary rounded w-3/4" /></div>)}
              </div>
            }
            const isRowSelected = selection?.type === 'row' && selection.rowIndex === index
            return <div key={row.__rowId} role="row" aria-rowindex={index + 2} className={`flex border-b border-border-subtle ${index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/50'} ${isRowSelected || isIndexColumnSelected ? 'bg-accent-green/10' : ''}`} style={rowStyle}>
              <div
                role="rowheader"
                aria-colindex={1}
                tabIndex={0}
                onClick={() => handleRowClick(index)}
                onKeyDown={(event) => {
                  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                    event.preventDefault()
                    event.stopPropagation()
                    const rect = event.currentTarget.getBoundingClientRect()
                    openContextMenu(rect.left + 16, rect.top + 16, 'row', index)
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleRowClick(index)
                  }
                }}
                onContextMenu={(event) => handleContextMenu(event, 'row', index)}
                className={`sticky left-0 z-10 flex cursor-pointer items-center justify-center border-r border-border-subtle px-3 text-xs ${isRowSelected ? 'text-accent-green font-medium !bg-accent-green/15 ring-2 ring-inset ring-accent-green' : isIndexColumnSelected ? 'text-accent-green !bg-accent-green/10' : 'text-text-tertiary hover:bg-surface-secondary'} ${index % 2 !== 0 ? 'bg-surface-secondary' : 'bg-surface'}`}
                style={{ width: 50, minWidth: 50 }}
                title={`Row ${index + 1}`}
              >
                {index + 1}
              </div>
              {columns.map(column => <GridCell key={column.id} column={column} row={row} rowIndex={index} />)}
            </div>
          })}
        </div>
      </div>
    </div>
  )
}
