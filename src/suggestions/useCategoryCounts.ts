import { useMemo } from 'react'
import { useDataStore } from '@/state/dataStore'
import { useSuggestionsStore } from './suggestionsStore'
import type { Suggestion, SuggestionCategory } from '@/types'

interface CategoryCounts {
  all: number
  cleaning: number
  analysis: number
  recipe: number
}

export function useCategoryCounts(
  cachedSuggestions: Suggestion[],
  tableId: string,
  effectiveCleaningCount: number | null,
): CategoryCounts {
  const tableData = useDataStore((state) => state.tableData[tableId])
  const consumed = useSuggestionsStore((state) => state.consumed)

  return useMemo(() => {
    let cleaningCount = 0

    // Post-engine-refactor the data store is emptied after materialization, so for
    // most tables `tableData.rows` is an empty array. Treat that as "no row data"
    // and fall back to the suggestion count below; the exact, effect-based count is
    // supplied by CleaningPanel via `effectiveCleaningCount` once it's mounted.
    if (tableData?.rows && tableData.rows.length > 0) {
      const cleaningSuggestions = cachedSuggestions.filter(
        (s) => s.category === 'cleaning' && s.context.cleaningOperation,
      )

      for (const suggestion of cleaningSuggestions) {
        const operation = suggestion.context.cleaningOperation
        const columnId = suggestion.context.columnId
        if (!operation || !columnId) continue

        let hasEffect = false
        for (const row of tableData.rows) {
          const value = row[columnId]

          if (operation.type === 'highlight_outliers') {
            if (typeof value === 'number' && (value < operation.lowerBound || value > operation.upperBound)) {
              hasEffect = true
              break
            }
          } else if (operation.type === 'trim') {
            if (value !== null && value !== undefined && String(value) !== String(value).trim()) {
              hasEffect = true
              break
            }
          } else if (
            operation.type === 'lowercase' ||
            operation.type === 'uppercase' ||
            operation.type === 'titlecase'
          ) {
            if (value !== null && value !== undefined) {
              const strValue = String(value)
              const transformed =
                operation.type === 'lowercase'
                  ? strValue.toLowerCase()
                  : operation.type === 'uppercase'
                    ? strValue.toUpperCase()
                    : strValue.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase())
              if (strValue !== transformed) {
                hasEffect = true
                break
              }
            }
          } else if (operation.type === 'replace_typos' || operation.type === 'normalize_case') {
            if (value !== null && value !== undefined && operation.mappings && operation.mappings[String(value)]) {
              hasEffect = true
              break
            }
          } else {
            hasEffect = true
            break
          }
        }

        if (hasEffect) {
          cleaningCount++
        }
      }
    } else {
      cleaningCount = cachedSuggestions.filter((s) => s.category === 'cleaning').length
    }

    const finalCleaningCount = effectiveCleaningCount ?? cleaningCount
    const nonConsumed = cachedSuggestions.filter((s) => !consumed.has(s.id))

    return {
      all: nonConsumed.length,
      cleaning: finalCleaningCount,
      analysis: nonConsumed.filter((s: Suggestion) => (s.category as SuggestionCategory) === 'analysis').length,
      recipe: nonConsumed.filter((s: Suggestion) => (s.category as SuggestionCategory) === 'recipe').length,
    }
  }, [cachedSuggestions, tableData?.rows, effectiveCleaningCount, consumed])
}
