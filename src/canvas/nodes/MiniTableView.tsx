import { memo, useState, useCallback, useEffect, useMemo } from 'react'
import { TableRow } from '@/state/dataStore'
import { ColumnSchema, CellValue, ViewFilterConfig } from '@/types'
import { formatNumber } from '@/lib/utils'
import { MINI_ROW_HEIGHT as CELL_HEIGHT, MINI_HEADER_HEIGHT as HEADER_HEIGHT, MINI_BUFFER_ROWS as BUFFER_ROWS, MINI_FOOTER_HEIGHT as FOOTER_HEIGHT } from '@/grid/constants'
import { computeDisplayValue } from '@/grid/displayUtils'
import { applyFilters, hasActiveFilters } from '@/grid/filterUtils'
import { getTableData } from '@/engine/tableDataService'
import { useProjectStore } from '@/state/projectStore'

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
  /** Monotonic data revision; changes trigger a preview refetch even if the hash is unchanged. */
  dataRevision?: number
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
  versionHash,
  dataRevision,
}: MiniTableViewProps) => {
  const [scrollTop, setScrollTop] = useState(0)

  // Data now lives in the engine (DuckDB), not the data store. Fetch a bounded
  // preview slice (already remapped to column ids by getTableData) for display.
  const [rows, setRows] = useState<TableRow[]>([])
  const [engineTotalRows, setEngineTotalRows] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const updateCacheInfo = useProjectStore((state) => state.updateCacheInfo)
  const schemaKey = useMemo(
    () => columns.map(column => `${column.id}:${column.name}:${column.type}`).join('|'),
    [columns],
  )

  useEffect(() => {
    let cancelled = false
    setIsLoaded(false)
    setLoadError(null)
    getTableData(tableId, 0, PREVIEW_LIMIT)
      .then(({ rows: fetched, totalRows, error }) => {
        if (cancelled) return
        if (error) {
          setRows([])
          setEngineTotalRows(0)
          setLoadError(error)
          return
        }
        setRows(fetched as TableRow[])
        setEngineTotalRows(totalRows)
      })
      .catch((error) => {
        if (cancelled) return
        setRows([])
        setEngineTotalRows(0)
        setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [tableId, versionHash, dataRevision, schemaKey, reloadKey])

  const handleRetry = useCallback(() => {
    updateCacheInfo(tableId, { error: undefined, isDirty: true, isComputing: false })
    setLoadError(null)
    setReloadKey(key => key + 1)
  }, [tableId, updateCacheInfo])

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
  const previewHeight = Math.min(
    maxHeight,
    HEADER_HEIGHT + totalRows * CELL_HEIGHT + FOOTER_HEIGHT,
  )
  const viewportHeight = previewHeight - FOOTER_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / CELL_HEIGHT) - BUFFER_ROWS)
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / CELL_HEIGHT) + BUFFER_ROWS
  )
  const virtualRows = visibleRows.slice(startIndex, endIndex)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

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

  const tableMinWidth = columns.length * MIN_CELL_WIDTH
  const gridTemplateColumns = `repeat(${columns.length}, minmax(${MIN_CELL_WIDTH}px, 1fr))`

  if (!isLoaded) {
    return (
      <div className="flex h-[100px] items-center justify-center text-xs text-text-tertiary" role="status">
        Loading table preview…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-[100px] flex-col items-center justify-center gap-2 px-4 text-center text-xs text-text-secondary" role="alert">
        <span>{loadError}</span>
        <button
          type="button"
          className="font-medium text-accent-green hover:underline"
          onClick={handleRetry}
        >
          Try again
        </button>
      </div>
    )
  }

  if (visibleRows.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center px-4 text-center text-xs text-text-tertiary">
        {filtersActive ? 'No rows match these filters.' : 'This table has no rows.'}
      </div>
    )
  }

  return (
    <div 
      className="flex flex-col overflow-hidden rounded-b-2xl"
      style={{ height: previewHeight }}
      role="table"
      aria-colcount={columns.length}
      aria-rowcount={engineTotalRows}
    >
      {/* Scrollable table area - hide scrollbars but keep functionality */}
      <div 
        className="flex-1 overflow-auto overscroll-none nowheel scrollbar-hide"
        style={{ overscrollBehavior: 'none' }}
        onScroll={handleScroll}
        onWheelCapture={(e) => e.stopPropagation()}
      >
        <div 
          style={{ 
            width: tableMinWidth,
            minWidth: '100%',
            height: totalRows * CELL_HEIGHT + HEADER_HEIGHT,
            position: 'relative'
          }}
        >
          <div 
            className="table-header-bg sticky top-0 z-10 grid border-b border-border"
            style={{ height: HEADER_HEIGHT, gridTemplateColumns }}
            role="row"
          >
            {columns.map((col, idx) => (
              <div
                key={col.id}
                className={`flex items-center px-1.5 text-xs font-medium text-accent-green dark:text-accent-text truncate ${
                  idx < columns.length - 1 ? 'border-r border-border' : ''
                }`}
                title={col.name}
                role="columnheader"
              >
                <span className="truncate">{col.name}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: startIndex * CELL_HEIGHT }} role="rowgroup">
            {virtualRows.map((row) => {
              return (
                <div
                  key={row.__rowId}
                  className="grid border-b border-border-subtle bg-surface"
                  style={{ height: CELL_HEIGHT, gridTemplateColumns }}
                  role="row"
                >
                  {columns.map((col, idx) => {
                    const value = getDisplayValue(row.__rowId, col.id, row[col.id], row)
                    const displayValue = formatCellValue(value, col.type)
                    const isLastColumn = idx === columns.length - 1
                    return (
                      <div
                        key={col.id}
                        className={`flex items-center px-1.5 text-xs overflow-hidden ${
                          !isLastColumn ? 'border-r border-border' : ''
                        } ${
                          col.type === 'number' ? 'justify-end font-mono text-text-primary' : 'text-text-primary'
                        }`}
                        title={displayValue}
                        role="cell"
                      >
                        <span className="truncate">
                          {displayValue || <span className="sr-only">Empty cell</span>}
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
        className="flex shrink-0 items-center gap-3 border-t border-border-subtle bg-surface-secondary px-3 text-xs text-text-secondary"
        style={{ height: FOOTER_HEIGHT }}
      >
        {filtersActive ? (
          <span>
            Showing <span className="font-medium text-text-primary">{formatNumber(totalRows)}</span>
            {' of '}
            {formatNumber(Math.max(unfilteredRowCount, engineTotalRows))} rows
          </span>
        ) : (
          <>
            <span>{columns.length} columns</span>
            <span>{formatNumber(engineTotalRows)} rows</span>
          </>
        )}
      </div>
    </div>
  )
})

MiniTableView.displayName = 'MiniTableView'
