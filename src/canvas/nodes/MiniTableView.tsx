import { memo, useState, useCallback, useEffect, useMemo } from 'react'
import { LoadingSpinner } from '@/layout/LoadingSpinner'
import { TableRow } from '@/state/dataStore'
import { ColumnSchema, CellValue, ViewFilterConfig } from '@/types'
import { formatNumber } from '@/lib/utils'
import { MINI_ROW_HEIGHT as CELL_HEIGHT, MINI_HEADER_HEIGHT as HEADER_HEIGHT, MINI_BUFFER_ROWS as BUFFER_ROWS, MINI_FOOTER_HEIGHT as FOOTER_HEIGHT } from '@/grid/constants'
import { computeDisplayValue } from '@/grid/displayUtils'
import { hasActiveFilters } from '@/grid/filtering/filterUtils'
import { getTableData } from '@/engine/materialization/tableDataService'
import { getEngine } from '@/engine/EngineAdapter'
import type { FilterConditionDef } from '@/engine/types'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'

/** Skip preview skeleton/footer when the engine answers in the same paint window. */
const PREVIEW_LOADING_DELAY_MS = 120

interface MiniTableViewProps {
  tableId: string
  columns: ColumnSchema[]
  maxHeight?: number
  patches?: {
    cellPatches?: Record<string, Record<string, CellValue>>
    deletedRows?: Set<string>
  }
  viewFilters?: ViewFilterConfig
  /** Current table version hash; changes trigger a preview refetch from the engine. */
  versionHash?: string
  /** Monotonic data revision; changes trigger a preview refetch even if the hash is unchanged. */
  dataRevision?: number
  /** Parent table is still importing/materializing; keep the column chrome visible. */
  isUpdating?: boolean
  updatingLabel?: string
}

const MIN_CELL_WIDTH = 65
// Canvas previews show a bounded sample; the grid view is the full virtualized table.
const PREVIEW_LIMIT = 1000

function buildFilterDefs(
  filters: ViewFilterConfig | undefined,
  columns: ColumnSchema[],
): FilterConditionDef[] | undefined {
  if (!filters || filters.conditions.length === 0) return undefined
  const columnsById = new Map(columns.map(column => [column.id, column]))
  return filters.conditions.map(condition => {
    const column = columnsById.get(condition.columnId)
    return {
      column: column?.name ?? condition.columnId,
      operator: condition.operator,
      value: condition.value,
      value2: condition.value2,
      columnType: column?.type,
    }
  })
}

export const MiniTableView = memo(({
  tableId,
  columns,
  maxHeight = 220,
  patches,
  viewFilters,
  versionHash,
  dataRevision,
  isUpdating = false,
  updatingLabel = 'Loading…',
}: MiniTableViewProps) => {
  const [scrollTop, setScrollTop] = useState(0)

  // Data now lives in the engine (DuckDB), not the data store. Fetch a bounded
  // preview slice (already remapped to column ids by getTableData) for display.
  const [rows, setRows] = useState<TableRow[]>([])
  const [engineTotalRows, setEngineTotalRows] = useState(0)
  const [matchingTotalRows, setMatchingTotalRows] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [showPreviewLoading, setShowPreviewLoading] = useState(false)
  const updateCacheInfo = useTableRuntimeStore((state) => state.updateCacheInfo)
  const schemaKey = useMemo(
    () => columns.map(column => `${column.id}:${column.name}:${column.type}`).join('|'),
    [columns],
  )
  const filterKey = useMemo(() => JSON.stringify(viewFilters ?? null), [viewFilters])
  const filtersActive = Boolean(viewFilters && hasActiveFilters(viewFilters))

  useEffect(() => {
    let cancelled = false
    setIsLoaded(false)
    setLoadError(null)
    setScrollTop(0)

    const loadPreview = async () => {
      if (!filtersActive) {
        const result = await getTableData(tableId, 0, PREVIEW_LIMIT)
        return {
          rows: result.rows,
          totalRows: result.totalRows,
          matchingRows: result.totalRows,
          error: result.error,
        }
      }

      // Materialize and read the unfiltered count first. The filtered slice then
      // uses the same engine-side predicate path as the main grid.
      const base = await getTableData(tableId, 0, 0)
      if (base.error) {
        return { rows: [], totalRows: 0, matchingRows: 0, error: base.error }
      }
      const slice = await getEngine().getFilteredSlice({
        tableId,
        filters: buildFilterDefs(viewFilters, columns),
        offset: 0,
        limit: PREVIEW_LIMIT,
        columns,
      })
      const fetched = slice.rows.map((row, index) => ({
        ...row,
        __rowId: row.__rowId as string || `row_${index}`,
      })) as TableRow[]
      return {
        rows: fetched,
        totalRows: base.totalRows,
        matchingRows: slice.totalRows,
      }
    }

    loadPreview()
      .then(({ rows: fetched, totalRows, matchingRows, error }) => {
        if (cancelled) return
        if (error) {
          setRows([])
          setEngineTotalRows(0)
          setMatchingTotalRows(0)
          setLoadError(error)
          return
        }
        setRows(fetched)
        setEngineTotalRows(totalRows)
        setMatchingTotalRows(matchingRows)
      })
      .catch((error) => {
        if (cancelled) return
        setRows([])
        setEngineTotalRows(0)
        setMatchingTotalRows(0)
        setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    columns,
    dataRevision,
    filterKey,
    filtersActive,
    reloadKey,
    schemaKey,
    tableId,
    versionHash,
    viewFilters,
  ])

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
    return result
  }, [rows, patches?.deletedRows])

  const totalRows = visibleRows.length
  const previewIsTruncated = matchingTotalRows > rows.length
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

  useEffect(() => {
    if (isLoaded && !isUpdating) {
      setShowPreviewLoading(false)
      return
    }
    const timer = window.setTimeout(() => setShowPreviewLoading(true), PREVIEW_LOADING_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [isLoaded, isUpdating])

  const showLoadingChrome = showPreviewLoading && (!isLoaded || isUpdating)
  const bodyHeight = showLoadingChrome && totalRows === 0
    ? Math.min(maxHeight, HEADER_HEIGHT + CELL_HEIGHT * 3 + FOOTER_HEIGHT)
    : previewHeight

  if (loadError && isLoaded) {
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

  return (
    <div
      className="flex flex-col overflow-hidden rounded-b-2xl"
      style={{ height: bodyHeight }}
      role="table"
      aria-colcount={columns.length}
      aria-rowcount={filtersActive ? matchingTotalRows : engineTotalRows}
      aria-busy={showLoadingChrome || undefined}
    >
      {/* nowheel + stopPropagation keep wheel scroll inside the preview (React Flow pans/zooms otherwise). */}
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
            height: Math.max(totalRows, showLoadingChrome ? 3 : 0) * CELL_HEIGHT + HEADER_HEIGHT,
            position: 'relative',
          }}
        >
          <div
            className="table-header-bg sticky top-0 z-10 grid border-y border-border"
            style={{ height: HEADER_HEIGHT, gridTemplateColumns }}
            role="row"
          >
            {columns.map((col, idx) => (
              <div
                key={col.id}
                className={`flex items-center px-1.5 text-xs font-medium text-text-secondary truncate ${
                  idx < columns.length - 1 ? 'border-r border-border' : ''
                }`}
                role="columnheader"
              >
                <span className="truncate">{col.name}</span>
              </div>
            ))}
          </div>

          {isLoaded && !isUpdating && visibleRows.length === 0 ? (
            <div
              className="flex items-center justify-center px-4 text-center text-xs text-text-tertiary"
              style={{ height: CELL_HEIGHT * 3 }}
            >
              {filtersActive ? 'No rows match these filters.' : 'This table has no rows.'}
            </div>
          ) : showLoadingChrome && totalRows === 0 ? (
            <div role="rowgroup" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="grid border-b border-border-subtle bg-surface"
                  style={{ height: CELL_HEIGHT, gridTemplateColumns }}
                >
                  {columns.map((col, idx) => (
                    <div
                      key={col.id}
                      className={`flex items-center px-1.5 ${
                        idx < columns.length - 1 ? 'border-r border-border' : ''
                      }`}
                    >
                      <span className="h-2.5 w-16 animate-pulse rounded bg-surface-tertiary" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: startIndex * CELL_HEIGHT }} role="rowgroup">
              {virtualRows.map((row) => (
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
                        role="cell"
                      >
                        <span className="truncate">
                          {displayValue || <span className="sr-only">Empty cell</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-3 border-t border-border-subtle bg-surface-secondary px-3 text-xs text-text-secondary"
        style={{ height: FOOTER_HEIGHT }}
      >
        {showLoadingChrome ? (
          <span className="flex items-center gap-2" role="status">
            <LoadingSpinner size="sm" />
            {isUpdating ? updatingLabel : 'Loading table preview…'}
          </span>
        ) : filtersActive ? (
          previewIsTruncated ? (
            <span>
              Previewing <span className="font-medium text-text-primary">{formatNumber(totalRows)}</span>
              {' of '}{formatNumber(matchingTotalRows)} matching rows
              {' '}({formatNumber(engineTotalRows)} total)
            </span>
          ) : (
            <span>
              Showing <span className="font-medium text-text-primary">{formatNumber(totalRows)}</span>
              {' matching rows '}({formatNumber(engineTotalRows)} total)
            </span>
          )
        ) : previewIsTruncated ? (
          <>
            <span>{columns.length} columns</span>
            <span>Previewing {formatNumber(totalRows)} of {formatNumber(engineTotalRows)} rows</span>
          </>
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
