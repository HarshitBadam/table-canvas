import { useMemo } from 'react'
import {
  useTableNodes,
  useAllProfiles,
  computeTableCompleteness,
  extractIssuesFromProfile,
  isDataStale,
  formatRelativeTime,
  computeTypeBreakdown,
  type TableQualityMetrics,
} from './dashboardHelpers'

export function useDataQualityMetrics(): {
  tableMetrics: TableQualityMetrics[]
  isLoading: boolean
} {
  const tableNodes = useTableNodes()
  const { profiles, isLoading: profilesLoading } = useAllProfiles()

  const tableMetrics = useMemo(() => {
    return tableNodes.map((table): TableQualityMetrics => {
      const profile = profiles[table.id]
      const rowCount = table.cacheInfo?.lastRowCount
        ?? profile?.rowCount
        ?? table.schema?.rowCount
        ?? 0
      const columnCount = table.schema?.columns?.length || 0
      const isLoading = !profile && profilesLoading

      const completeness = computeTableCompleteness(profile, rowCount)
      const issues = extractIssuesFromProfile(profile, table.schema)

      const importedAt = table.kind === 'source_table' ? table.createdAt : null
      const isStale = table.kind === 'source_table' ? isDataStale(importedAt) : false
      const freshnessLabel = table.kind === 'source_table'
        ? `Imported ${formatRelativeTime(importedAt)}`
        : 'Derived'

      const typeBreakdown = computeTypeBreakdown(table.schema)

      return {
        tableId: table.id,
        tableName: table.name,
        tableKind: table.kind as 'source_table' | 'derived_table',
        rowCount,
        columnCount,
        completeness,
        issueCount: issues.length,
        issues,
        isLoading,
        hasProfile: !!profile,
        importedAt,
        isStale,
        freshnessLabel,
        typeBreakdown,
      }
    })
  }, [tableNodes, profiles, profilesLoading])

  return { tableMetrics, isLoading: profilesLoading }
}
