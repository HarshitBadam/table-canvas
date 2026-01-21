/**
 * CleaningPanel - Batch cleaning suggestions panel
 * Displays and applies data cleaning suggestions for source tables
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { useSuggestionsStore } from './suggestionsStore'
import { computeSuggestionEffect } from './computeEffects'
import { isPlaceholder } from './cleaningConstants'
import { loadProfileForTable, useProfilingStore } from '@/profiling/profiler'
import type { Suggestion, CellValue } from '@/lib/types'

// Types
interface CellChange {
  rowId: string
  columnId: string
  oldValue: CellValue
  newValue: CellValue
}

interface CleaningPanelProps {
  suggestions: Suggestion[]
  tableId: string
  onComplete?: () => void
  onCountChange?: (count: number) => void
}

export function CleaningPanel({ suggestions, tableId, onComplete: _onComplete, onCountChange }: CleaningPanelProps) {
  // Store hooks
  const saveSnapshot = useProjectStore((state) => state.saveSnapshot)
  const markNodeDirty = useProjectStore((state) => state.markNodeDirty)
  const setHighlights = useProjectStore((state) => state.setHighlights)
  const node = useProjectStore((state) => state.getTableNode(tableId))
  const patches = useProjectStore((state) => state.patches[tableId])
  const tableData = useDataStore((state) => state.tableData[tableId])
  const setTableData = useDataStore((state) => state.setTableData)
  const clearSuggestionsCache = useSuggestionsStore((state) => state.clearCache)
  
  // Local state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isApplying, setIsApplying] = useState(false)

  // Get existing highlights
  const existingHighlights = useMemo(() => {
    return patches?.highlightedCells || new Set<string>()
  }, [patches?.highlightedCells])

  // Compute effects for each suggestion
  const suggestionsWithEffects = useMemo(() => {
    if (!tableData?.rows) return []

    // Merge tableData.rows with patches to get current actual values
    let rows = tableData.rows
      .filter(row => !patches?.deletedRows?.has(row.__rowId))
      .map(row => {
        const patchedRow = { ...row }
        if (patches?.cellPatches) {
          for (const [columnId, columnPatches] of Object.entries(patches.cellPatches)) {
            if (columnPatches[row.__rowId] !== undefined) {
              patchedRow[columnId] = columnPatches[row.__rowId]
            }
          }
        }
        return patchedRow
      })
    
    // Add inserted rows
    if (patches?.insertedRows) {
      for (const inserted of patches.insertedRows) {
        const insertedRow: TableRow = { __rowId: inserted.rowId, ...inserted.values }
        rows.push(insertedRow)
      }
    }

    // Deduplicate suggestions by ID
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
        // Filter out highlight suggestions that are already applied
        if (s.operationType === 'review' && s.highlights.length > 0) {
          const allAlreadyHighlighted = s.highlights.every(h => existingHighlights.has(h))
          if (allAlreadyHighlighted) return false
        }
        return s.changes.length > 0 || s.highlights.length > 0
      })
    
    return result
  }, [suggestions, tableData?.rows, patches?.cellPatches, patches?.deletedRows, patches?.insertedRows, existingHighlights])

  // Report count to parent
  useEffect(() => {
    onCountChange?.(suggestionsWithEffects.length)
  }, [suggestionsWithEffects.length, onCountChange])

  // Selection handlers
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

  // Compute selected suggestions
  const selectedSuggestions = useMemo(() => {
    return suggestionsWithEffects.filter(s => selectedIds.has(s.suggestion.id))
  }, [suggestionsWithEffects, selectedIds])

  const selectedCount = selectedSuggestions.length

  // Apply handler
  const handleApply = useCallback(async () => {
    const currentSelectedSuggestions = suggestionsWithEffects.filter(s => selectedIds.has(s.suggestion.id))
    const currentSelectedCount = currentSelectedSuggestions.length

    if (currentSelectedCount === 0 || !tableData?.rows) {
      return
    }

    setIsApplying(true)

    try {
      const changesMap = new Map<string, CellChange>()
      const allHighlights: string[] = []
      
      // Build merged rows for scanning
      let mergedRows = tableData.rows
        .filter(row => !patches?.deletedRows?.has(row.__rowId))
        .map(row => {
          const patchedRow = { ...row }
          if (patches?.cellPatches) {
            for (const [columnId, columnPatches] of Object.entries(patches.cellPatches)) {
              if (columnPatches[row.__rowId] !== undefined) {
                patchedRow[columnId] = columnPatches[row.__rowId]
              }
            }
          }
          return patchedRow
        })
      
      // Add inserted rows
      if (patches?.insertedRows) {
        for (const inserted of patches.insertedRows) {
          const insertedRow: TableRow = { __rowId: inserted.rowId, ...inserted.values }
          mergedRows.push(insertedRow)
        }
      }
      
      // Separate nullify_placeholders from other operations
      // We process nullify_placeholders LAST so it takes precedence over normalize_case
      const placeholderSuggestions = currentSelectedSuggestions.filter(
        s => s.suggestion.context.cleaningOperation?.type === 'nullify_placeholders'
      )
      const otherSuggestions = currentSelectedSuggestions.filter(
        s => s.suggestion.context.cleaningOperation?.type !== 'nullify_placeholders'
      )
      
      // Process other operations FIRST (like normalize_case, trim, etc.)
      for (const item of otherSuggestions) {
        for (const change of item.changes) {
          const key = `${change.rowId}:${change.columnId}`
          changesMap.set(key, change)
        }
        allHighlights.push(...item.highlights)
      }
      
      // Process nullify_placeholders LAST - this ensures placeholders become null
      // even if normalize_case tried to change "NULL" to "null" (string)
      for (const item of placeholderSuggestions) {
        const columnId = item.suggestion.context.columnId
        if (columnId) {
          for (const row of mergedRows) {
            const value = row[columnId]
            if (value === null || value === undefined) continue
            
            if (isPlaceholder(value)) {
              const key = `${row.__rowId}:${columnId}`
              changesMap.set(key, {
                rowId: row.__rowId,
                columnId,
                oldValue: value,
                newValue: null,
              })
            }
          }
        }
        allHighlights.push(...item.highlights)
      }
      
      const allChanges = Array.from(changesMap.values())

      // Apply data changes
      if (allChanges.length > 0) {
        saveSnapshot('Apply cleaning operations')
        
        // Apply changes to rows
        const updatedRows = mergedRows.map(row => {
          const rowChanges = allChanges.filter(c => c.rowId === row.__rowId)
          if (rowChanges.length === 0) return row
          
          const updatedRow = { ...row }
          for (const change of rowChanges) {
            updatedRow[change.columnId] = change.newValue === null ? null : change.newValue
          }
          return updatedRow
        })
        
        // Set profile to loading to prevent stale suggestions
        useProfilingStore.getState().clearAndStartLoading(tableId)
        clearSuggestionsCache(tableId)
        
        // Update base data
        setTableData(tableId, updatedRows)
        
        // Update patches - add changes to patches for consistency
        useProjectStore.setState((state) => {
          if (!state.patches[tableId]) {
            state.patches[tableId] = {
              cellPatches: {},
              deletedRows: new Set(),
              insertedRows: [],
              highlightedCells: new Set(),
            }
          }
          
          const patches = state.patches[tableId]
          if (!patches.cellPatches) {
            patches.cellPatches = {}
          }
          
          for (const change of allChanges) {
            if (!patches.cellPatches[change.columnId]) {
              patches.cellPatches[change.columnId] = {}
            }
            patches.cellPatches[change.columnId][change.rowId] = change.newValue
          }
          
          const node = state.nodes[tableId]
          if (node) {
            node.updatedAt = new Date().toISOString()
          }
        })
        
        markNodeDirty(tableId)
        await loadProfileForTable(tableId, true)
      }

      // Apply highlights
      if (allHighlights.length > 0) {
        setHighlights(tableId, allHighlights)
      }

      setSelectedIds(new Set())
    } catch (error) {
      console.error('[CleaningPanel] handleApply ERROR:', error)
      throw error
    } finally {
      setIsApplying(false)
    }
  }, [
    suggestionsWithEffects,
    selectedIds,
    tableData?.rows,
    tableId,
    patches,
    saveSnapshot,
    setTableData,
    markNodeDirty,
    setHighlights,
    clearSuggestionsCache,
  ])

  // Early returns
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
      {/* Header */}
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

      {/* Suggestions list */}
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

      {/* Apply button */}
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

// Icons
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
