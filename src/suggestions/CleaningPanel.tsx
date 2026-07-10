import { useState, useMemo, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { TableRow } from '@/state/dataStore'
import { getTableData } from '@/engine/materializationService'
import { computeSuggestionEffect } from './computeEffects'
import { useCleaningApply } from './useCleaningApply'
import type { Suggestion } from '@/types'

interface CleaningPanelProps {
  suggestions: Suggestion[]
  tableId: string
  onComplete?: () => void
  onCountChange?: (count: number) => void
}

export function CleaningPanel({ suggestions, tableId, onComplete: _onComplete, onCountChange }: CleaningPanelProps) {
  const node = useProjectStore((state) => state.getTableNode(tableId))
  const patches = useProjectStore((state) => state.patches[tableId])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Rows live in the engine now (the data store is emptied after materialization),
  // so fetch the current, fully-patched, id-keyed rows from there. We pull the whole
  // table because cleaning must scan and affect every row, not just a preview window.
  const [rows, setRows] = useState<TableRow[]>([])
  const [rowsLoaded, setRowsLoaded] = useState(false)
  // node.updatedAt bumps after an apply, which re-triggers the fetch with cleaned data.
  const refreshKey = node?.updatedAt

  useEffect(() => {
    let cancelled = false
    setRowsLoaded(false)
    const SCAN_PAGE = 10000
    getTableData(tableId, 0, SCAN_PAGE)
      .then(async ({ rows: firstRows, totalRows }) => {
        if (cancelled) return
        let allRows = firstRows
        if (totalRows > firstRows.length) {
          const { rows: fullRows } = await getTableData(tableId, 0, totalRows)
          if (cancelled) return
          allRows = fullRows
        }
        setRows(allRows as TableRow[])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setRowsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [tableId, refreshKey])

  const existingHighlights = useMemo(() => {
    return patches?.highlightedCells || new Set<string>()
  }, [patches?.highlightedCells])

  const suggestionsWithEffects = useMemo(() => {
    if (rows.length === 0) return []

    // `rows` already reflects every patch (cell edits, deletions, insertions) because
    // EngineAdapter.loadTable bakes them in before materialization, so there is no
    // manual patch merge to do here.

    const seen = new Set<string>()
    const deduplicatedSuggestions = suggestions.filter(s => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })

    // Calculate mean for numeric columns (needed for fill_missing_numeric)
    const getMeanValue = (columnId: string): number | undefined => {
      const values = rows
        .map(r => r[columnId])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      if (values.length === 0) return undefined
      return values.reduce((a, b) => a + b, 0) / values.length
    }

    const result = deduplicatedSuggestions
      .filter(s => s.category === 'cleaning' && s.context.cleaningOperation)
      .map(suggestion => {
        const columnId = suggestion.context.columnId
        const meanValue = columnId ? getMeanValue(columnId) : undefined
        const effect = computeSuggestionEffect(suggestion, rows, meanValue)
        return { suggestion, ...effect }
      })
      .filter(s => {
        if (s.operationType === 'review' && s.highlights.length > 0) {
          const allAlreadyHighlighted = s.highlights.every(h => existingHighlights.has(h))
          if (allAlreadyHighlighted) return false
        }
        return s.changes.length > 0 || s.highlights.length > 0
      })
    
    return result
  }, [suggestions, rows, existingHighlights])

  useEffect(() => {
    // Don't report a (premature) zero while rows are still loading.
    if (!rowsLoaded) return
    onCountChange?.(suggestionsWithEffects.length)
  }, [rowsLoaded, suggestionsWithEffects.length, onCountChange])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(suggestionsWithEffects.map(s => s.suggestion.id)))
  }, [suggestionsWithEffects])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const selectedSuggestions = useMemo(() => {
    return suggestionsWithEffects.filter(s => selectedIds.has(s.suggestion.id))
  }, [suggestionsWithEffects, selectedIds])

  const selectedCount = selectedSuggestions.length

  const { isApplying, handleApply } = useCleaningApply({
    suggestionsWithEffects,
    selectedIds,
    tableId,
    setSelectedIds,
    rows,
  })

  if (node?.kind !== 'source_table') {
    return (
      <div className="p-4 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
          <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm text-text-secondary">
          Cleaning operations are only available for source tables.
        </p>
      </div>
    )
  }

  if (!rowsLoaded) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-text-secondary">Loading table data…</p>
      </div>
    )
  }

  if (suggestionsWithEffects.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-text-secondary">
          No cleaning suggestions for this table.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {suggestionsWithEffects.length} issue{suggestionsWithEffects.length !== 1 ? 's' : ''}
          {selectedCount > 0 && ` · ${selectedCount} selected`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs text-accent-blue hover:underline"
          >
            All
          </button>
          <button
            onClick={deselectAll}
            className="text-xs text-text-tertiary hover:text-text-secondary"
          >
            None
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {suggestionsWithEffects.map(({ suggestion, changes, highlights, operationType }) => {
          const isSelected = selectedIds.has(suggestion.id)
          const count = operationType === 'review' ? highlights.length : changes.length
          const Icon = operationType === 'review' ? ReviewIcon : FixIcon
          
          return (
            <div
              key={suggestion.id}
              onClick={() => toggleSelection(suggestion.id)}
              className={`p-3 border-b border-border cursor-pointer transition-colors ${
                isSelected ? 'bg-accent-green/10' : 'hover:bg-surface-secondary'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isSelected 
                    ? 'bg-accent-green text-white' 
                    : 'bg-surface-tertiary text-text-tertiary'
                }`}>
                  <Icon />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {suggestion.title}
                    </span>
                    <span className="text-xs font-medium text-text-tertiary flex-shrink-0">
                      {count}
                    </span>
                  </div>
                  {changes.length > 0 && (
                    <div className="mt-1 text-xs text-text-secondary">
                      e.g. <code className="px-1 py-0.5 bg-surface-tertiary rounded text-red-500">{String(changes[0].oldValue)}</code>
                      {' → '}
                      <code className="px-1 py-0.5 bg-surface-tertiary rounded text-green-500">{changes[0].newValue === null ? '∅ empty' : String(changes[0].newValue)}</code>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={handleApply}
          disabled={selectedCount === 0 || isApplying}
          className="w-full btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? 'Applying...' : `Apply ${selectedCount} fix${selectedCount !== 1 ? 'es' : ''}`}
        </button>
      </div>
    </div>
  )
}

function FixIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ReviewIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}
