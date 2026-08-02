import { useMemo } from 'react'
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
  _tableId: string,
  effectiveCleaningCount: number | null,
  dismissedIds: Set<string> = new Set(),
): CategoryCounts {
  const consumed = useSuggestionsStore((state) => state.consumed)

  return useMemo(() => {
    const nonConsumed = cachedSuggestions.filter(
      (s) => !consumed.has(s.id) && !dismissedIds.has(s.id),
    )
    const fallbackCleaningCount = nonConsumed.filter(
      suggestion => suggestion.category === 'cleaning',
    ).length
    const cleaningCount = effectiveCleaningCount ?? fallbackCleaningCount
    const analysisCount = nonConsumed.filter(
      (suggestion: Suggestion) =>
        (suggestion.category as SuggestionCategory) === 'analysis',
    ).length
    const recipeCount = nonConsumed.filter(
      (suggestion: Suggestion) =>
        (suggestion.category as SuggestionCategory) === 'recipe',
    ).length

    return {
      all: cleaningCount + analysisCount + recipeCount,
      cleaning: cleaningCount,
      analysis: analysisCount,
      recipe: recipeCount,
    }
  }, [cachedSuggestions, effectiveCleaningCount, consumed, dismissedIds])
}
