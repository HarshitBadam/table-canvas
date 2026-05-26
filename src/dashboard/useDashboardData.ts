/**
 * Barrel re-export so existing imports from './useDashboardData' still work.
 */

export type {
  DataQualityIssue,
  ColumnTypeBreakdown,
  TableQualityMetrics,
  Insight,
  ProjectHealthMetrics,
  LineageNode,
  LineageEdge,
} from './dashboardHelpers'

export {
  formatRelativeTime,
  isDataStale,
  computeTypeBreakdown,
  formatStatValue,
  computeTableCompleteness,
  extractIssuesFromProfile,
  extractInsightsFromProfile,
  useTableNodes,
  useChartNodes,
  useAllProfiles,
} from './dashboardHelpers'

export { useDataQualityMetrics } from './useDataQualityMetrics'
export { useProjectHealthMetrics } from './useProjectHealthMetrics'
export { useAggregatedInsights } from './useAggregatedInsights'
export { useTopSuggestions } from './useTopSuggestions'
export { useLineageData } from './useLineageData'
export { useNavigateToTable } from './useNavigateToTable'
