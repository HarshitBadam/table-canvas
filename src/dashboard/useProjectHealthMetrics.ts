import { useMemo } from 'react'
import type { ProjectHealthMetrics } from './dashboardHelpers'
import { useDataQualityMetrics } from './useDataQualityMetrics'

export function useProjectHealthMetrics(): ProjectHealthMetrics {
  const { tableMetrics } = useDataQualityMetrics()

  return useMemo(() => {
    if (tableMetrics.length === 0) {
      return {
        overallCompleteness: 100,
        totalTables: 0,
        totalRows: 0,
        totalColumns: 0,
      }
    }

    const tablesWithProfiles = tableMetrics.filter(t => t.hasProfile)
    const overallCompleteness = tablesWithProfiles.length > 0
      ? Math.round(tablesWithProfiles.reduce((sum, t) => sum + t.completeness, 0) / tablesWithProfiles.length)
      : 100

    const totalRows = tableMetrics.reduce((sum, t) => sum + t.rowCount, 0)
    const totalColumns = tableMetrics.reduce((sum, t) => sum + t.columnCount, 0)

    return {
      overallCompleteness,
      totalTables: tableMetrics.length,
      totalRows,
      totalColumns,
    }
  }, [tableMetrics])
}
