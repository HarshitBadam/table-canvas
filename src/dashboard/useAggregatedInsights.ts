import { useMemo } from 'react'
import { useDataStore } from '@/state/dataStore'
import {
  useTableNodes,
  useAllProfiles,
  extractInsightsFromProfile,
  type Insight,
} from './dashboardHelpers'

export function useAggregatedInsights(): { insights: Insight[]; isLoading: boolean } {
  const tableNodes = useTableNodes()
  const { profiles, isLoading } = useAllProfiles()
  const tableData = useDataStore((state) => state.tableData)

  const insights = useMemo(() => {
    const allInsights: Insight[] = []

    for (const table of tableNodes) {
      const profile = profiles[table.id]
      const data = tableData[table.id]
      const rowCount = data?.rows?.length || table.schema?.rowCount || profile?.rowCount || 0

      const tableInsights = extractInsightsFromProfile(
        table.id,
        table.name,
        profile,
        table.schema,
        rowCount
      )
      allInsights.push(...tableInsights)
    }

    const severityOrder = { warning: 0, info: 1, success: 2 }
    return allInsights
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      .slice(0, 10)
  }, [tableNodes, profiles, tableData])

  return { insights, isLoading }
}
