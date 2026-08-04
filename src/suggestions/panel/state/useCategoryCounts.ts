import { useMemo } from 'react'
import { useSuggestionsStore } from './suggestionsStore'
import type { Suggestion } from '@/types'

interface CategoryCounts {
  all: number
  cleaning: number
  analysis: number
  recipe: number
}

export function useCategoryCounts(
  cachedSuggestions: Suggestion[],
  effectiveCleaningCount: number | null,
  dismissedIds: Set<string> = new Set(),
): CategoryCounts {
  const consumed = useSuggestionsStore((state) => state.consumed)

  return useMemo(() => {
    const nonConsumed = cachedSuggestions.filter(
      (suggestion) => !consumed.has(suggestion.id) && !dismissedIds.has(suggestion.id),
    )
    const fallbackCleaningCount = nonConsumed.filter(
      (suggestion) => suggestion.category === 'cleaning',
    ).length
    const cleaningCount = effectiveCleaningCount ?? fallbackCleaningCount
    const analysisCount = nonConsumed.filter(
      (suggestion) => suggestion.category === 'analysis',
    ).length
    const recipeCount = nonConsumed.filter(
      (suggestion) => suggestion.category === 'recipe',
    ).length

    return {
      all: cleaningCount + analysisCount + recipeCount,
      cleaning: cleaningCount,
      analysis: analysisCount,
      recipe: recipeCount,
    }
  }, [cachedSuggestions, effectiveCleaningCount, consumed, dismissedIds])
}
