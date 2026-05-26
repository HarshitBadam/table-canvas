import { useMemo } from 'react'
import { useChartNodes, type ProjectHealthMetrics } from './dashboardHelpers'
import { useDataQualityMetrics } from './useDataQualityMetrics'

export function useProjectHealthMetrics(): ProjectHealthMetrics {
  const { tableMetrics, isLoading } = useDataQualityMetrics()
  const chartNodes = useChartNodes()

  return useMemo(() => {
    if (tableMetrics.length === 0) {
      return {
        overallCompleteness: 100,
        totalIssues: 0,
        tablesWithIssues: 0,
        totalTables: 0,
        totalRows: 0,
        totalColumns: 0,
        chartCount: chartNodes.length,
        isLoading,
      }
    }

    const tablesWithProfiles = tableMetrics.filter(t => t.hasProfile)
    const overallCompleteness = tablesWithProfiles.length > 0
      ? Math.round(tablesWithProfiles.reduce((sum, t) => sum + t.completeness, 0) / tablesWithProfiles.length)
      : 100

    const totalIssues = tableMetrics.reduce((sum, t) => sum + t.issueCount, 0)
    const tablesWithIssues = tableMetrics.filter(t => t.issueCount > 0).length
    const totalRows = tableMetrics.reduce((sum, t) => sum + t.rowCount, 0)
    const totalColumns = tableMetrics.reduce((sum, t) => sum + t.columnCount, 0)

    return {
      overallCompleteness,
      totalIssues,
      tablesWithIssues,
      totalTables: tableMetrics.length,
      totalRows,
      totalColumns,
      chartCount: chartNodes.length,
      isLoading,
    }
  }, [tableMetrics, chartNodes.length, isLoading])
}
