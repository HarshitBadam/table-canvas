import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { TableRow } from '@/state/dataStore'
import { ColumnSchema, CellValue, ViewFilterConfig } from '@/types'
import { formatNumber } from '@/lib/utils'
import { MINI_ROW_HEIGHT as CELL_HEIGHT, MINI_HEADER_HEIGHT as HEADER_HEIGHT, MINI_BUFFER_ROWS as BUFFER_ROWS, MINI_FOOTER_HEIGHT as FOOTER_HEIGHT } from '@/grid/constants'
import { computeDisplayValue } from '@/grid/displayUtils'
import { applyFilters, hasActiveFilters } from '@/grid/filterUtils'
import { getTableData } from '@/engine/materializationService'

interface MiniTableViewProps {
  tableId: string
  columns: ColumnSchema[]
  maxHeight?: number // Maximum viewport height in pixels
  patches?: {
    cellPatches?: Record<string, Record<string, CellValue>>
    deletedRows?: Set<string>
  }
  viewFilters?: ViewFilterConfig
  /** Current table version hash; changes trigger a preview refetch from the engine. */
  versionHash?: string
}

// Column width: minimum width, will expand to fill container
const MIN_CELL_WIDTH = 65
// Canvas previews show a bounded sample; the grid view is the full virtualized table.
const PREVIEW_LIMIT = 1000


export const MiniTableView = memo(({ 
  tableId, 
  columns,
  maxHeight = 220,
  patches,
  viewFilters,
  versionHash
}: MiniTableViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(maxHeight - FOOTER_HEIGHT)
  const [containerWidth, setContainerWidth] = useState(0)

  // Data now lives in the engine (DuckDB), not the data store. Fetch a bounded
  // preview slice (already remapped to column ids by getTableData) for display.
  const [rows, setRows] = useState<TableRow[]>([])
  const [engineTotalRows, setEngineTotalRows] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoaded(false)
    getTableData(tableId, 0, PREVIEW_LIMIT)
      .then(({ rows: fetched, totalRows }) => {
        if (cancelled) return
        setRows(fetched as TableRow[])
        setEngineTotalRows(totalRows)
      })
      .catch(() => {
        if (cancelled) return
        setRows([])
        setEngineTotalRows(0)
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [tableId, versionHash])

  const getDisplayValue = useCallback((rowId: string, columnId: string, baseValue: CellValue, row?: TableRow): CellValue => {
    return computeDisplayValue(rowId, columnId, baseValue, row, columns, patches?.cellPatches)
  }, [patches, columns])

  const visibleRows = useMemo(() => {
    let result = rows
    if (patches?.deletedRows?.size) {
      result = result.filter(row => !patches.deletedRows?.has(row.__rowId))
    }
    if (viewFilters && hasActiveFilters(viewFilters)) {
      result = applyFilters(result, viewFilters, columns, getDisplayValue)
    }
    return result
  }, [rows, patches?.deletedRows, viewFilters, columns, getDisplayValue])
  
  const filtersActive = viewFilters && hasActiveFilters(viewFilters)
  const unfilteredRowCount = useMemo(() => {
    if (!patches?.deletedRows?.size) return rows.length
    return rows.filter(row => !patches.deletedRows?.has(row.__rowId)).length
  }, [rows, patches?.deletedRows])

  const totalRows = visibleRows.length
  const startIndex = Math.max(0, Math.floor(scrollTop / CELL_HEIGHT) - BUFFER_ROWS)
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + containerHeight) / CELL_HEIGHT) + BUFFER_ROWS
  )
  const virtualRows = visibleRows.slice(startIndex, endIndex)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height)
      setContainerWidth(entries[0].contentRect.width)
    })
    observer.observe(container)
    setContainerHeight(container.clientHeight)
    setContainerWidth(container.clientWidth)

    return () => observer.disconnect()
  }, [])

  const cellWidth = useMemo(() => {
    if (columns.length === 0 || containerWidth === 0) return MIN_CELL_WIDTH
    const calculatedWidth = Math.floor(containerWidth / columns.length)
    return Math.max(MIN_CELL_WIDTH, calculatedWidth)
  }, [columns.length, containerWidth])

  const formatCellValue = useCallback((value: CellValue, type: string): string => {
    if (value === null || value === undefined || value === '') return ''
    if (type === 'number' && typeof value === 'number') {
      return formatNumber(value)
    }
    if (type === 'boolean' || typeof value === 'boolean') {
      if (value === true || value === 'true' || value === 'True') return 'True'
      if (value === false || value === 'false' || value === 'False') return 'False'
    }
    return String(value)
  }, [])

  const totalWidth = Math.max(columns.length * cellWidth, containerWidth)

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[100px] text-[11px] text-text-tertiary">
        Loading…
      </div>
    )
  }

  if (visibleRows.length === 0) {
    return (
      <div className="flex items-center justify-center h-[100px] text-[11px] text-text-tertiary">
        No data available
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="flex flex-col overflow-hidden rounded-b-2xl"
      style={{ height: maxHeight }}
    >
      <div 
        className="flex-shrink-0 bg-gray-50 dark:bg-gray-800/80 border-b border-border"
        style={{ height: 8 }}
      />

      {/* Scrollable table area - hide scrollbars but keep functionality */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto nowheel scrollbar-hide"
        onScroll={handleScroll}
        onWheelCapture={(e) => e.stopPropagation()}
      >
        <div 
          style={{ 
            width: totalWidth,
            height: totalRows * CELL_HEIGHT + HEADER_HEIGHT,
            position: 'relative'
          }}
        >
          <div 
            className="sticky top-0 z-10 flex border-b border-border table-header-bg"
            style={{ height: HEADER_HEIGHT }}
          >
            {columns.map((col, idx) => (
              <div
                key={col.id}
                className={`flex items-center px-1.5 text-[10px] font-medium text-accent-green truncate ${
                  idx < columns.length - 1 ? 'border-r border-border' : ''
                }`}
                style={{ width: cellWidth, minWidth: MIN_CELL_WIDTH, flex: idx === columns.length - 1 ? 1 : undefined }}
                title={col.name}
              >
                <span className="truncate">{col.name}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: startIndex * CELL_HEIGHT }}>
            {virtualRows.map((row, idx) => {
              const actualIndex = startIndex + idx
              return (
                <div
                  key={row.__rowId}
                  className={`flex border-b border-border-subtle ${
                    actualIndex % 2 === 0 
                      ? 'bg-surface' 
                      : 'bg-gray-50 dark:bg-gray-800/30'
                  }`}
                  style={{ height: CELL_HEIGHT }}
                >
                  {columns.map((col, idx) => {
                    const value = getDisplayValue(row.__rowId, col.id, row[col.id], row)
                    const displayValue = formatCellValue(value, col.type)
                    const isLastColumn = idx === columns.length - 1
                    return (
                      <div
                        key={col.id}
                        className={`flex items-center px-1.5 text-[11px] overflow-hidden ${
                          !isLastColumn ? 'border-r border-border-subtle' : ''
                        } ${
                          col.type === 'number' ? 'justify-end font-mono text-text-primary' : 'text-text-primary'
                        }`}
                        style={{ width: cellWidth, minWidth: MIN_CELL_WIDTH, flex: isLastColumn ? 1 : undefined }}
                        title={displayValue}
                      >
                        <span className="truncate">
                          {displayValue || <span className="text-text-tertiary italic">—</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div 
        className="flex-shrink-0 px-3 flex items-center text-[11px] text-text-tertiary bg-gray-50 dark:bg-gray-800/80 border-t border-border rounded-b-2xl"
        style={{ height: FOOTER_HEIGHT }}
      >
        {filtersActive ? (
          <>
            <span className="text-text-primary font-medium">{formatNumber(totalRows)}</span>
            <span className="mx-1">of</span>
            <span>{formatNumber(Math.max(unfilteredRowCount, engineTotalRows))}</span>
            <span className="mx-1">rows</span>
            <span className="text-accent-green ml-1">●</span>
          </>
        ) : (
          <>{formatNumber(engineTotalRows)} rows × {columns.length} cols</>
        )}
      </div>
    </div>
  )
})

MiniTableView.displayName = 'MiniTableView'
