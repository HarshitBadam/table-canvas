import { useMemo } from 'react'
import { generateSuggestions } from '@/suggestions/engine'
import { getExistingDerivedTables } from '@/suggestions/derivedTableContext'
import { generateTableVersionHash, useSuggestionsStore } from '@/suggestions/suggestionsStore'
import type { Suggestion } from '@/types'
import { useTableNodes, useAllProfiles } from './dashboardHelpers'

export function useTopSuggestions(limit: number = 5): {
  suggestions: Array<Suggestion & { tableName: string }>
  isLoading: boolean
} {
  const tableNodes = useTableNodes()
  const { profiles, isLoading } = useAllProfiles()
  const consumed = useSuggestionsStore((state) => state.consumed)

  const suggestions = useMemo(() => {
    const allSuggestions: Array<Suggestion & { tableName: string }> = []

    for (const table of tableNodes) {
      const profile = profiles[table.id]

      if (!table.schema || !profile) continue

      const rowCount = table.cacheInfo?.lastRowCount
        ?? profile.rowCount
        ?? table.schema.rowCount
        ?? 0
      const versionHash = generateTableVersionHash(
        table.id,
        rowCount,
        table.schema.columns.length,
        table.updatedAt,
      )

      try {
        const existingDerivedTables = getExistingDerivedTables(tableNodes, table.id)

        const tableSuggestions = generateSuggestions({
          tableId: table.id,
          tableName: table.name,
          schema: table.schema,
          profile: {
            columns: profile.columns,
            rowCount: profile.rowCount,
          },
          tableVersionHash: versionHash,
          existingDerivedTables,
        })

        for (const suggestion of tableSuggestions) {
          if (!consumed.has(suggestion.id)) {
            allSuggestions.push({ ...suggestion, tableName: table.name })
          }
        }
      } catch (error) {
        console.error('[useTopSuggestions] Suggestion generation failed for table:', table.name, error);
      }
    }

    const confidenceOrder = { high: 0, medium: 1, low: 2 }
    const categoryOrder = { cleaning: 0, analysis: 1, recipe: 2 }

    return allSuggestions
      .sort((a, b) => {
        const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
        if (confDiff !== 0) return confDiff
        return categoryOrder[a.category] - categoryOrder[b.category]
      })
      .slice(0, limit)
  }, [tableNodes, profiles, consumed, limit])

  return { suggestions, isLoading }
}
