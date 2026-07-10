import { useState, useCallback } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { useSuggestionsStore } from './suggestionsStore'
import { computeCombinedSuggestionEffect } from './computeEffects'
import { loadProfileForTable, useProfilingStore } from '@/lib/profiling'
import { showToast } from './commands/types'
import type { Suggestion } from '@/types'

interface SuggestionWithEffect {
  suggestion: Suggestion
}

interface UseCleaningApplyParams {
  suggestionsWithEffects: SuggestionWithEffect[]
  selectedIds: Set<string>
  tableId: string
  setSelectedIds: (updater: (prev: Set<string>) => Set<string>) => void
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
      const { changes: allChanges, highlights: allHighlights } =
        computeCombinedSuggestionEffect(
          currentSelectedSuggestions.map(item => item.suggestion),
          rows,
        )

      if (allChanges.length > 0) {
        saveSnapshot('Apply cleaning operations')

        const changesByRow = new Map<string, typeof allChanges>()
        for (const change of allChanges) {
          const rowChanges = changesByRow.get(change.rowId) ?? []
          rowChanges.push(change)
          changesByRow.set(change.rowId, rowChanges)
        }

        const updatedRows = rows.map((row) => {
          const rowChanges = changesByRow.get(row.__rowId)
          if (!rowChanges) return row

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
        if (allChanges.length === 0) saveSnapshot('Highlight cells for review')
        setHighlights(tableId, allHighlights)
      }

      setSelectedIds(() => new Set())
      showToast({
        type: 'success',
        message: allChanges.length > 0
          ? `Applied ${allChanges.length.toLocaleString()} cell change${allChanges.length === 1 ? '' : 's'}`
          : `Highlighted ${allHighlights.length.toLocaleString()} cell${allHighlights.length === 1 ? '' : 's'} for review`,
      })
    } catch (error) {
      console.error('[CleaningPanel] handleApply ERROR:', error)
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not apply cleaning operations',
      })
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
