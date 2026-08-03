import { useState, useMemo, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease'
import { TableRow } from '@/state/dataStore'
import { computeSuggestionEffect } from './computeEffects'
import { useCleaningApply } from './useCleaningApply'
import { loadCleaningPreview } from './cleaningRows'
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
  const { canEdit } = useWorkspaceLease()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [rows, setRows] = useState<TableRow[]>([])
  const [rowsLoaded, setRowsLoaded] = useState(false)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const [totalRows, setTotalRows] = useState(0)
  const [previewIsTruncated, setPreviewIsTruncated] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const refreshKey = node?.updatedAt

  useEffect(() => {
    let cancelled = false
    setRowsLoaded(false)
    setRowsError(null)
    loadCleaningPreview(tableId)
      .then((preview) => {
        if (cancelled) return
        setRows(preview.rows)
        setTotalRows(preview.totalRows)
        setPreviewIsTruncated(preview.isTruncated)
      })
      .catch((cause) => {
        if (!cancelled) {
          setRows([])
          setTotalRows(0)
          setPreviewIsTruncated(false)
          setRowsError(cause instanceof Error ? cause.message : 'Could not load table rows for cleaning.')
        }
      })
      .finally(() => {
        if (!cancelled) setRowsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [tableId, refreshKey, retryNonce])

  const existingHighlights = useMemo(() => {
    return patches?.highlightedCells || new Set<string>()
  }, [patches?.highlightedCells])

  const suggestionsWithEffects = useMemo(() => {
    if (rows.length === 0) return []

    const seen = new Set<string>()
    const deduplicatedSuggestions = suggestions.filter(s => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })

    const getNumericFillValue = (
      columnId: string,
      strategy: 'mean' | 'median' | 'zero',
    ): number | undefined => {
      if (strategy === 'zero') return 0
      const values = rows
        .map(r => r[columnId])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      if (values.length === 0) return undefined
      if (strategy === 'median') {
        values.sort((a, b) => a - b)
        const middle = Math.floor(values.length / 2)
        return values.length % 2 === 0
          ? (values[middle - 1] + values[middle]) / 2
          : values[middle]
      }
      return values.reduce((a, b) => a + b, 0) / values.length
    }

    const result = deduplicatedSuggestions
      .filter(s => s.category === 'cleaning' && s.context.cleaningOperation)
      .map(suggestion => {
        const columnId = suggestion.context.columnId
        const operation = suggestion.context.cleaningOperation
        const numericFillValue =
          columnId && operation?.type === 'fill_missing_numeric'
            ? getNumericFillValue(columnId, operation.strategy)
            : undefined
        const effect = computeSuggestionEffect(suggestion, rows, numericFillValue)
        return { suggestion, ...effect }
      })
      .filter(s => {
        if (s.operationType === 'review' && s.highlights.length > 0) {
          const allAlreadyHighlighted = s.highlights.every(h => existingHighlights.has(h))
          if (allAlreadyHighlighted && !previewIsTruncated) return false
        }
        return previewIsTruncated || s.changes.length > 0 || s.highlights.length > 0
      })

    // Keep review-only outlier suggestions after actionable cleaning fixes.
    return result.sort((a, b) => {
      const aIsOutlier = a.suggestion.context.cleaningOperation?.type === 'highlight_outliers'
        || a.suggestion.context.cleaningOperation?.type === 'remove_outliers'
      const bIsOutlier = b.suggestion.context.cleaningOperation?.type === 'highlight_outliers'
        || b.suggestion.context.cleaningOperation?.type === 'remove_outliers'
      return Number(aIsOutlier) - Number(bIsOutlier)
    })
  }, [suggestions, rows, existingHighlights, previewIsTruncated])

  useEffect(() => {
    if (!rowsLoaded || rowsError) return
    onCountChange?.(suggestionsWithEffects.length)
  }, [rowsLoaded, rowsError, suggestionsWithEffects.length, onCountChange])

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
    totalRows,
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

  if (rowsError) {
    return (
      <div className="p-5 text-center" role="alert">
        <p className="text-sm font-medium text-text-primary">Cleaning preview unavailable</p>
        <p className="mt-1 text-xs text-text-secondary">{rowsError}</p>
        <button
          onClick={() => setRetryNonce((value) => value + 1)}
          className="btn btn-secondary mt-4 text-xs"
        >
          Try again
        </button>
      </div>
    )
  }

  if (suggestionsWithEffects.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-accent-green flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-secondary/40 px-4 py-3">
        <span className="text-xs font-medium text-text-tertiary">
          {suggestionsWithEffects.length} issue{suggestionsWithEffects.length !== 1 ? 's' : ''}
          {previewIsTruncated ? ' in preview' : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={selectAll}
            className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-accent-green transition-colors hover:bg-accent-green/10 hover:text-accent-green/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            All
          </button>
          <button
            onClick={deselectAll}
            className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            None
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {suggestionsWithEffects.map(({ suggestion, changes, highlights, operationType }) => {
          const isSelected = selectedIds.has(suggestion.id)
          const count = operationType === 'review' ? highlights.length : changes.length
          
          return (
            <label
              key={suggestion.id}
              className={`block min-h-[76px] cursor-pointer border-b border-border-subtle px-4 py-3.5 transition-colors ${
                isSelected ? 'bg-accent-green/10' : 'hover:bg-surface-secondary/70'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelection(suggestion.id)}
                className="sr-only"
              />
              <div className={`flex gap-3 ${changes.length > 0 ? 'items-start' : 'items-center'}`}>
                <div aria-hidden="true" className={`${changes.length > 0 ? 'mt-0.5' : ''} flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  isSelected 
                    ? 'bg-accent-green text-white' 
                    : 'bg-surface-tertiary text-text-tertiary'
                }`}>
                  <FixIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium leading-5 text-text-primary">
                      {suggestion.title}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-text-tertiary">
                      {previewIsTruncated ? `${count}+` : count}
                    </span>
                  </div>
                  {changes.length > 0 && (
                    <div className="mt-1.5 text-xs leading-5 text-text-secondary">
                      e.g. <code className="rounded bg-surface-tertiary px-1 py-px text-error-text">{String(changes[0].oldValue)}</code>
                      {' → '}
                      <code className="rounded bg-surface-tertiary px-1 py-px text-success-dark">{changes[0].newValue === null ? '∅ empty' : String(changes[0].newValue)}</code>
                    </div>
                  )}
                </div>
              </div>
            </label>
          )
        })}
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={handleApply}
          disabled={selectedCount === 0 || isApplying || !canEdit}
          title={!canEdit ? EDITING_ELSEWHERE_TOOLTIP : undefined}
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
