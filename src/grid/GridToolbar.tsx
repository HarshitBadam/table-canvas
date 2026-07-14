import type { ViewFilterConfig } from '@/types'
import { hasActiveFilters, countActiveFilters } from './filterUtils'
import { formatNumber } from '@/lib/utils'
import { useGridContext } from './useGridContext'

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
    <div
      role="toolbar"
      aria-label="Table actions"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2 sm:gap-3 sm:px-4 sm:py-3"
    >
      <div className="w-full min-w-0 text-sm text-text-secondary lg:w-auto" aria-live="polite">
        {hasActiveFilters(filters) ? (
          <>
            <span className="font-medium text-accent-text">{formatNumber(totalRows)}</span>
            <span className="text-text-tertiary"> of {formatNumber(unfilteredTotalRows)}</span>
            {' '}rows × {columnCount} columns
          </>
        ) : (
          <>{formatNumber(totalRows)} rows × {columnCount} columns</>
        )}
        {isDirty && !isMaterializing && !isComputing && (
          <span className="ml-2 text-xs font-medium text-warning-text">
            Refresh needed
          </span>
        )}
        {(isMaterializing || isComputing) && (
          <span className="ml-2 animate-pulse text-xs text-text-secondary">
            Updating table…
          </span>
        )}
      </div>
      <div className="hidden flex-1 lg:block" />

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
        {isEditable && (
          <div role="group" aria-label="Insert" className="flex items-center gap-2">
            <button 
              onClick={handleAddRow}
              className="btn btn-primary min-h-11 gap-1.5 px-2.5 py-0 text-xs sm:min-h-0 sm:px-3 sm:py-1.5"
              title={`Insert row ${rowInsertionDescription}`}
              aria-label={`Add row ${rowInsertionDescription}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 18h16M4 12h7m6-3v6m-3-3h6" />
              </svg>
              <span>Row</span>
            </button>
            <button 
              onClick={onAddColumn}
              className="btn btn-secondary min-h-11 gap-1.5 px-2.5 py-0 text-xs sm:min-h-0 sm:px-3 sm:py-1.5"
              title={`Insert column ${columnInsertionDescription}`}
              aria-label={`Add column ${columnInsertionDescription}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4v16M18 4v16M12 4v7m-3 6h6m-3-3v6" />
              </svg>
              <span>Column</span>
            </button>
          </div>
        )}

        <div role="group" aria-label="Explore" className="flex min-w-0 flex-wrap items-center gap-2">
          <button 
            onClick={handleToggleFilters}
            className={`btn min-h-11 gap-1.5 px-2.5 py-0 text-xs sm:min-h-0 sm:px-3 sm:py-1.5 ${showFilterPanel || hasActiveFilters(filters) ? 'btn-primary' : 'btn-ghost'}`}
            aria-label="Filter table"
            aria-pressed={showFilterPanel}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Filter</span>
            {hasActiveFilters(filters) && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-medium">
                {countActiveFilters(filters)}
              </span>
            )}
          </button>

          <button 
            onClick={onOpenChartBuilder}
            className="btn btn-secondary min-h-11 gap-1.5 px-2.5 py-0 text-xs sm:min-h-0 sm:px-3 sm:py-1.5"
            title="Create chart from this table"
            aria-label="Create chart from this table"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Chart</span>
          </button>

          {highlightedCells && highlightedCells.size > 0 && (
            <button 
              onClick={() => onClearHighlights(tableId)}
              className="btn btn-ghost min-h-11 gap-1.5 px-2.5 py-0 text-xs text-accent-text hover:bg-accent-green/10 sm:min-h-0 sm:px-3 sm:py-1.5"
              title="Clear all highlighted cells"
              aria-label={`Clear ${highlightedCells.size} highlighted cells`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Clear {highlightedCells.size}</span>
            </button>
          )}

          <button 
            onClick={onToggleSuggestions}
            className={`btn min-h-11 gap-1.5 px-2.5 py-0 text-xs sm:min-h-0 sm:px-3 sm:py-1.5 ${showSuggestions ? 'btn-primary' : 'btn-ghost'}`}
            aria-label="Suggestions"
            aria-pressed={showSuggestions}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>Suggestions</span>
          </button>
        </div>
      </div>
    </div>
  )
}
