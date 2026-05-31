import type { ViewFilterConfig } from '@/types'
import { hasActiveFilters, countActiveFilters } from './filterUtils'
import { formatNumber } from '@/lib/utils'
import { useGridContext } from './GridContext'

interface GridToolbarProps {
  totalRows: number
  unfilteredTotalRows: number
  columnCount: number
  isDirty: boolean
  isMaterializing: boolean
  isComputing: boolean
  showFilterPanel: boolean
  showSuggestions: boolean
  rowInsertionDescription: string
  columnInsertionDescription: string
  onAddColumn: () => void
  onToggleSuggestions: () => void
  onOpenChartBuilder: () => void
  onClearHighlights: (tableId: string) => void
}

export function GridToolbar({
  totalRows,
  unfilteredTotalRows,
  columnCount,
  isDirty,
  isMaterializing,
  isComputing,
  showFilterPanel,
  showSuggestions,
  rowInsertionDescription,
  columnInsertionDescription,
  onAddColumn,
  onToggleSuggestions,
  onOpenChartBuilder,
  onClearHighlights,
}: GridToolbarProps) {
  const { filters: contextFilters, isEditable, highlightedCells, tableId, handleAddRow, handleToggleFilters } = useGridContext()
  const filters = contextFilters as ViewFilterConfig
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
      <div className="text-sm text-text-secondary">
        {hasActiveFilters(filters) ? (
          <>
            <span className="font-medium text-green-600 dark:text-green-400">{formatNumber(totalRows)}</span>
            <span className="text-text-tertiary"> of {formatNumber(unfilteredTotalRows)}</span>
            {' '}rows × {columnCount} columns
          </>
        ) : (
          <>{formatNumber(totalRows)} rows × {columnCount} columns</>
        )}
        {isDirty && !isMaterializing && !isComputing && (
          <span className="ml-2 text-amber-600 dark:text-amber-400 text-xs">
            (needs refresh)
          </span>
        )}
        {(isMaterializing || isComputing) && (
          <span className="ml-2 text-blue-600 dark:text-blue-400 text-xs animate-pulse">
            (computing...)
          </span>
        )}
      </div>
      <div className="flex-1" />
      
      {isEditable && (
        <>
          <button 
            onClick={handleAddRow}
            className="btn btn-primary text-xs gap-1.5"
            title={`Insert row ${rowInsertionDescription}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Row<span className="text-[10px] opacity-60 font-normal ml-1">{rowInsertionDescription}</span>
          </button>
          <button 
            onClick={onAddColumn}
            className="btn btn-primary text-xs gap-1.5"
            title={`Insert column ${columnInsertionDescription}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Column<span className="text-[10px] opacity-60 font-normal ml-1">{columnInsertionDescription}</span>
          </button>
          <span className="badge badge-blue">Editable</span>
        </>
      )}
      {!isEditable && (
        <span className="badge badge-orange">View only (Derived table)</span>
      )}
      
      <button 
        onClick={handleToggleFilters}
        className={`btn text-xs ${showFilterPanel || hasActiveFilters(filters) ? 'btn-primary' : 'btn-ghost'}`}
      >
        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filter
        {hasActiveFilters(filters) && (
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-white/20 rounded-full">
            {countActiveFilters(filters)}
          </span>
        )}
      </button>
      
      <button 
        onClick={onOpenChartBuilder}
        className="btn btn-secondary text-xs gap-1.5"
        title="Create chart from this table"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Create Chart
      </button>
      {highlightedCells && highlightedCells.size > 0 && (
        <button 
          onClick={() => onClearHighlights(tableId)}
          className="btn btn-ghost text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
          title="Clear all highlighted cells"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear {highlightedCells.size} Highlight{highlightedCells.size !== 1 ? 's' : ''}
        </button>
      )}
      
      <button 
        onClick={onToggleSuggestions}
        className={`btn text-xs ${showSuggestions ? 'btn-primary' : 'btn-ghost'}`}
      >
        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Suggestions
      </button>
      
    </div>
  )
}
