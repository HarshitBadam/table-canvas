/**
 * Barrel re-export so existing imports from './useDashboardData' still work.
 */

export type {
  TableQualityMetrics,
  LineageNode,
  LineageEdge,
} from './dashboardHelpers'

export { useDataQualityMetrics } from './useDataQualityMetrics'
export { useProjectHealthMetrics } from './useProjectHealthMetrics'
export { useTopSuggestions } from './useTopSuggestions'
export { useLineageData } from './useLineageData'
