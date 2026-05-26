import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useDataStore } from '@/state/dataStore'
import { ColumnSchema, CellValue, ViewFilterConfig } from '@/types'
import { formatNumber } from '@/lib/utils'
import { evaluateFormula, FormulaValue } from '@/formula'
import { applyFilters, hasActiveFilters } from '@/grid/filterUtils'

interface MiniTableViewProps {
  tableId: string
  columns: ColumnSchema[]
  maxHeight?: number // Maximum viewport height in pixels
  patches?: {
    cellPatches?: Record<string, Record<string, CellValue>>
    deletedRows?: Set<string>
  }
  viewFilters?: ViewFilterConfig
}

// Compact styling constants - matching GridView style
const CELL_HEIGHT = 32
const HEADER_HEIGHT = 36
const BUFFER_ROWS = 3
const FOOTER_HEIGHT = 24

// Column width: minimum width, will expand to fill container
const MIN_CELL_WIDTH = 65

// Row type with index signature
interface GridRow {
  __rowId: string
  [columnId: string]: CellValue
}

export const MiniTableView = memo(({ 
  tableId, 
  columns,
  maxHeight = 220,
  patches,
  viewFilters
}: MiniTableViewProps) => {
  const tableData = useDataStore((state) => state.tableData[tableId])
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(maxHeight - FOOTER_HEIGHT)
  const [containerWidth, setContainerWidth] = useState(0)

  // Get rows from data store
  const rows: GridRow[] = useMemo(() => {
    if (!tableData?.rows) return []
    return tableData.rows as GridRow[]
  }, [tableData])

  // Get display value with patches applied and formula evaluation (defined early for filter use)
  const getDisplayValue = useCallback((rowId: string, columnId: string, baseValue: CellValue, row?: GridRow): CellValue => {
    // Check for patches first
    if (patches?.cellPatches?.[columnId]?.[rowId] !== undefined) {
      return patches.cellPatches[columnId][rowId]
    }
    
    // Check if this is a formula column
    const column = columns.find(c => c.id === columnId)
    if (column?.formula && column.isComputed && row) {
      // Build context for formula evaluation
      const rowData: Record<string, FormulaValue> = {}
      columns.forEach(col => {
        if (!col.isComputed) {
          const val = patches?.cellPatches?.[col.id]?.[rowId] ?? row[col.id]
          rowData[col.id] = val as FormulaValue
        }
      })
      
      const columnInfo = columns
        .filter(c => !c.isComputed)
        .map(c => ({ id: c.id, name: c.name, type: c.type }))
      
      const result = evaluateFormula(column.formula, {
        row: rowData,
        columns: columnInfo,
      })
      
      if (result.success) {
        return result.value as CellValue
      }
      // Return error indicator for formula errors
      return '#ERROR'
    }
    
    return baseValue
  }, [patches, columns])

  // Filter out deleted rows, then apply view filters
  const visibleRows = useMemo(() => {
    // First filter out deleted rows
    let result = rows
    if (patches?.deletedRows?.size) {
      result = result.filter(row => !patches.deletedRows?.has(row.__rowId))
    }
    
    // Then apply view filters if active
    if (viewFilters && hasActiveFilters(viewFilters)) {
      result = applyFilters(result, viewFilters, columns, getDisplayValue)
    }
    
    return result
  }, [rows, patches?.deletedRows, viewFilters, columns, getDisplayValue])
  
  // Track if filters are active for display
  const filtersActive = viewFilters && hasActiveFilters(viewFilters)
  const unfilteredRowCount = useMemo(() => {
    if (!patches?.deletedRows?.size) return rows.length
    return rows.filter(row => !patches.deletedRows?.has(row.__rowId)).length
  }, [rows, patches?.deletedRows])

  // Virtual scrolling calculations
  const totalRows = visibleRows.length
  const startIndex = Math.max(0, Math.floor(scrollTop / CELL_HEIGHT) - BUFFER_ROWS)
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + containerHeight) / CELL_HEIGHT) + BUFFER_ROWS
  )
  const virtualRows = visibleRows.slice(startIndex, endIndex)

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Measure container on mount
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

  // Calculate dynamic cell width to fill container
  const cellWidth = useMemo(() => {
    if (columns.length === 0 || containerWidth === 0) return MIN_CELL_WIDTH
    const calculatedWidth = Math.floor(containerWidth / columns.length)
    // Use at least MIN_CELL_WIDTH, but expand to fill if there's room
    return Math.max(MIN_CELL_WIDTH, calculatedWidth)
  }, [columns.length, containerWidth])

  // Format cell value for display
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

  // Total width based on all columns - ensure it fills the container
  const totalWidth = Math.max(columns.length * cellWidth, containerWidth)

  if (!tableData || visibleRows.length === 0) {
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
      {/* Top bar - matches footer */}
      <div 
        className="flex-shrink-0 bg-gray-50 dark:bg-gray-800/80 border-b border-border"
        style={{ height: 8 }}
      />

      {/* Scrollable table area - hide scrollbars but keep functionality */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto nowheel hide-scrollbar"
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
          {/* Sticky Header - Green like GridView */}
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

          {/* Virtual Rows - Alternating colors like GridView */}
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

      {/* Footer - Fixed at bottom */}
      <div 
        className="flex-shrink-0 px-3 flex items-center text-[11px] text-text-tertiary bg-gray-50 dark:bg-gray-800/80 border-t border-border rounded-b-2xl"
        style={{ height: FOOTER_HEIGHT }}
      >
        {filtersActive ? (
          <>
            <span className="text-text-primary font-medium">{formatNumber(totalRows)}</span>
            <span className="mx-1">of</span>
            <span>{formatNumber(unfilteredRowCount)}</span>
            <span className="mx-1">rows</span>
            <span className="text-accent-green ml-1">●</span>
          </>
        ) : (
          <>{formatNumber(totalRows)} rows × {columns.length} cols</>
        )}
      </div>
    </div>
  )
})

MiniTableView.displayName = 'MiniTableView'
