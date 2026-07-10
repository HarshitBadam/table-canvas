import { useMemo } from 'react'
import { useDataStore } from '@/state/dataStore'
import { generateSuggestions } from '@/suggestions/engine'
import { generateTableVersionHash, useSuggestionsStore } from '@/suggestions/suggestionsStore'
import type { DerivedTableNode, Suggestion } from '@/types'
import { useTableNodes, useAllProfiles } from './dashboardHelpers'

export function useTopSuggestions(limit: number = 5): {
  suggestions: Array<Suggestion & { tableName: string }>
  isLoading: boolean
} {
  const tableNodes = useTableNodes()
  const { profiles, isLoading } = useAllProfiles()
  const tableData = useDataStore((state) => state.tableData)
  const consumed = useSuggestionsStore((state) => state.consumed)

  const suggestions = useMemo(() => {
    const allSuggestions: Array<Suggestion & { tableName: string }> = []

    for (const table of tableNodes) {
      const profile = profiles[table.id]
      const data = tableData[table.id]

      if (!table.schema || !profile) continue

      const rowCount = data?.rows?.length || table.schema?.rowCount || profile?.rowCount || 0
      const versionHash = generateTableVersionHash(
        table.id,
        rowCount,
        table.schema.columns.length,
        table.updatedAt,
      )

      try {
        const existingDerivedTables = tableNodes
          .filter(
            (candidate): candidate is DerivedTableNode =>
              candidate.kind === 'derived_table' &&
              candidate.plan.upstreamNodeIds.includes(table.id),
          )
          .map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            transformType: candidate.plan.transformDef.type,
            groupByColumns:
              'groupByColumns' in candidate.plan.transformDef
                ? candidate.plan.transformDef.groupByColumns
                : undefined,
          }))

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
  }, [tableNodes, profiles, tableData, consumed, limit])

  return { suggestions, isLoading }
}
