import { useMemo } from 'react'
import { useDataStore } from '@/state/dataStore'
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
  const tableData = useDataStore((state) => state.tableData)

  const tableMetrics = useMemo(() => {
    return tableNodes.map((table): TableQualityMetrics => {
      const profile = profiles[table.id]
      const data = tableData[table.id]
      const rowCount = data?.rows?.length || table.schema?.rowCount || profile?.rowCount || 0
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
  }, [tableNodes, profiles, tableData, profilesLoading])

  return { tableMetrics, isLoading: profilesLoading }
}
