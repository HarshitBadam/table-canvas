import { useMemo } from 'react'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import {
  useTableNodes,
  useAllProfiles,
  computeTableCompleteness,
  extractIssuesFromProfile,
  formatRelativeTime,
  type TableQualityMetrics,
} from './dashboardHelpers'

export function useDataQualityMetrics(): {
  tableMetrics: TableQualityMetrics[]
} {
  const tableNodes = useTableNodes()
  const { profiles } = useAllProfiles()
  const runtimeCacheInfo = useTableRuntimeStore((state) => state.cacheInfo)

  const tableMetrics = useMemo(() => {
    return tableNodes.map((table): TableQualityMetrics => {
      const profile = profiles[table.id]
      const rowCount = runtimeCacheInfo[table.id]?.lastRowCount
        ?? profile?.rowCount
        ?? table.schema?.rowCount
        ?? 0
      const columnCount = table.schema?.columns?.length || 0

      const completeness = computeTableCompleteness(profile, rowCount)
      const issueCount = extractIssuesFromProfile(profile, table.schema).length

      const freshnessLabel = table.kind === 'source_table'
        ? `Imported ${formatRelativeTime(table.createdAt)}`
        : 'Derived'

      return {
        tableId: table.id,
        tableName: table.name,
        tableKind: table.kind as 'source_table' | 'derived_table',
        rowCount,
        columnCount,
        completeness,
        issueCount,
        hasProfile: !!profile,
        freshnessLabel,
      }
    })
  }, [runtimeCacheInfo, tableNodes, profiles])

  return { tableMetrics }
}
