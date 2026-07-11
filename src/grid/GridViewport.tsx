import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ColumnHeader } from './ColumnHeader'
import { GridCell } from './GridCell'
import { HEADER_HEIGHT, ROW_HEIGHT } from './constants'
import { useGridContext } from './useGridContext'
import type { WindowedRowsState } from './hooks/useWindowedRows'

interface GridViewportProps {
  totalRows: number
  windowed: WindowedRowsState
  onAddColumn: () => void
}

export function GridViewport({ totalRows, windowed, onAddColumn }: GridViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { ensureRange, isLoading, totalRows: windowedTotalRows } = windowed
  const {
    columns, filteredRows, getColumnWidth, isEditable, isCornerSelected, selection,
    isIndexColumnSelected, handleCornerClick, handleContextMenu, handleRowClick,
  } = useGridContext()
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const firstVisibleIndex = virtualRows[0]?.index ?? 0
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? 0

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
          className="sticky top-0 z-20 flex border-b border-border table-header-bg"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            role="columnheader"
            aria-colindex={1}
            tabIndex={0}
            onClick={handleCornerClick}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleCornerClick()
              }
            }}
            onContextMenu={(event) => handleContextMenu(event, 'corner')}
            className={`sticky left-0 z-30 flex items-center justify-center px-3 text-xs font-medium border-r border-border cursor-pointer table-header-bg ${
              isCornerSelected ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 ring-2 ring-inset ring-green-500' : 'text-text-tertiary hover:bg-surface-tertiary'
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
              <button type="button" onClick={onAddColumn} aria-label="Add column" className="flex items-center justify-center px-2 text-xs cursor-pointer border-l border-border text-text-tertiary hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400" style={{ width: 40, minWidth: 40, height: '100%' }} title="Add column">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          )}
        </div>
        <div style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}>
          {virtualRows.map(virtualRow => {
            const index = virtualRow.index
            const row = filteredRows[index]
            const rowStyle = { position: 'absolute' as const, top: virtualRow.start, height: ROW_HEIGHT, width: '100%' }
            if (!row) {
              return <div key={`skeleton-${index}`} role="row" aria-rowindex={index + 2} className="flex border-b border-border-subtle bg-surface animate-pulse" style={rowStyle}>
                <div role="rowheader" aria-colindex={1} className="sticky left-0 z-10 flex items-center justify-center px-3 text-xs border-r border-border-subtle text-text-tertiary bg-surface" style={{ width: 50, minWidth: 50 }}>{index + 1}</div>
                {columns.map(column => <div key={column.id} className="flex items-center px-3" style={{ width: getColumnWidth(column.id) }}><div className="h-4 bg-surface-secondary rounded w-3/4" /></div>)}
              </div>
            }
            const isRowSelected = selection?.type === 'row' && selection.rowIndex === index
            return <div key={row.__rowId} role="row" aria-rowindex={index + 2} className={`flex border-b border-border-subtle ${index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/50'} ${isRowSelected || isIndexColumnSelected ? 'bg-accent-green/10' : ''}`} style={rowStyle}>
              <div role="rowheader" aria-colindex={1} tabIndex={0} onClick={() => handleRowClick(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleRowClick(index) } }} onContextMenu={(event) => handleContextMenu(event, 'row', index)} className={`sticky left-0 z-10 flex items-center justify-center px-3 text-xs border-r border-border-subtle cursor-pointer ${isRowSelected ? 'text-accent-green font-medium !bg-accent-green/15 ring-2 ring-inset ring-accent-green' : isIndexColumnSelected ? 'text-accent-green !bg-accent-green/10' : 'text-text-tertiary hover:bg-surface-secondary'} ${index % 2 !== 0 ? 'bg-surface-secondary' : 'bg-surface'}`} style={{ width: 50, minWidth: 50 }} title={`Row ${index + 1}`}>{index + 1}</div>
              {columns.map(column => <GridCell key={column.id} column={column} row={row} rowIndex={index} />)}
            </div>
          })}
        </div>
      </div>
    </div>
  )
}
