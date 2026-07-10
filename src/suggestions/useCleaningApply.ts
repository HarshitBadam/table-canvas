import { useState, useCallback } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { useSuggestionsStore } from './suggestionsStore'
import { isPlaceholder } from './cleaningConstants'
import { loadProfileForTable, useProfilingStore } from '@/lib/profiling'
import type { CellValue } from '@/types'

interface CellChange {
  rowId: string
  columnId: string
  oldValue: CellValue
  newValue: CellValue
}

interface SuggestionWithEffect {
  suggestion: {
    id: string
    context: {
      cleaningOperation?: { type: string; mappings?: Record<string, string> } | null
      columnId?: string
    }
  }
  changes: CellChange[]
  highlights: string[]
  operationType: string
}

interface UseCleaningApplyParams {
  suggestionsWithEffects: SuggestionWithEffect[]
  selectedIds: Set<string>
  tableId: string
  setSelectedIds: (updater: (prev: Set<string>) => Set<string>) => void
  /** Current, fully-patched, id-keyed rows fetched from the engine by CleaningPanel. */
  rows: TableRow[]
}

export function useCleaningApply({
  suggestionsWithEffects,
  selectedIds,
  tableId,
  setSelectedIds,
  rows,
}: UseCleaningApplyParams) {
  const saveSnapshot = useProjectStore((state) => state.saveSnapshot)
  const markNodeDirty = useProjectStore((state) => state.markNodeDirty)
  const setHighlights = useProjectStore((state) => state.setHighlights)
  const setTableData = useDataStore((state) => state.setTableData)
  const clearSuggestionsCache = useSuggestionsStore((state) => state.clearCache)

  const [isApplying, setIsApplying] = useState(false)

  const handleApply = useCallback(async () => {
    const currentSelectedSuggestions = suggestionsWithEffects.filter((s) => selectedIds.has(s.suggestion.id))
    const currentSelectedCount = currentSelectedSuggestions.length

    if (currentSelectedCount === 0 || rows.length === 0) {
      return
    }

    setIsApplying(true)

    try {
      const changesMap = new Map<string, CellChange>()
      const allHighlights: string[] = []

      // Engine rows already reflect all patches (cell edits, deletions, insertions),
      // so they are used directly with no extra merge.
      const mergedRows = rows

      // Process nullify_placeholders LAST so it takes precedence over normalize_case
      const placeholderSuggestions = currentSelectedSuggestions.filter(
        (s) => s.suggestion.context.cleaningOperation?.type === 'nullify_placeholders',
      )
      const otherSuggestions = currentSelectedSuggestions.filter(
        (s) => s.suggestion.context.cleaningOperation?.type !== 'nullify_placeholders',
      )

      for (const item of otherSuggestions) {
        for (const change of item.changes) {
          const key = `${change.rowId}:${change.columnId}`
          changesMap.set(key, change)
        }
        allHighlights.push(...item.highlights)
      }

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

      if (allChanges.length > 0) {
        saveSnapshot('Apply cleaning operations')

        const updatedRows = mergedRows.map((row) => {
          const rowChanges = allChanges.filter((c) => c.rowId === row.__rowId)
          if (rowChanges.length === 0) return row

          const updatedRow = { ...row }
          for (const change of rowChanges) {
            updatedRow[change.columnId] = change.newValue === null ? null : change.newValue
          }
          return updatedRow
        })

        useProfilingStore.getState().clearAndStartLoading(tableId)
        clearSuggestionsCache(tableId)

        setTableData(tableId, updatedRows)

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

      if (allHighlights.length > 0) {
        setHighlights(tableId, allHighlights)
      }

      setSelectedIds(() => new Set())
    } catch (error) {
      console.error('[CleaningPanel] handleApply ERROR:', error)
      throw error
    } finally {
      setIsApplying(false)
    }
  }, [
    suggestionsWithEffects,
    selectedIds,
    rows,
    tableId,
    saveSnapshot,
    setTableData,
    markNodeDirty,
    setHighlights,
    clearSuggestionsCache,
    setSelectedIds,
  ])

  return { isApplying, handleApply }
}
