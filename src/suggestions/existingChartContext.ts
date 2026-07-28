import type { ChartConfig, ChartNode, ProjectNode, Suggestion } from '@/types'

function normalizedChartType(type: string): string {
  return type === 'histogram' ? 'bar' : type
}

function normalizedGroupBy(config: ChartConfig): string | undefined {
  return config.groupBy === config.xAxis ? undefined : config.groupBy
}

function normalizedAggregation(config: ChartConfig): string {
  return config.aggregation ?? (config.yAxis ? 'sum' : 'count')
}

function sameSeries(left?: string[], right?: string[]): boolean {
  const normalizedLeft = [...(left ?? [])].sort()
  const normalizedRight = [...(right ?? [])].sort()
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index])
}

export function chartSatisfiesSuggestion(
  chart: ChartNode,
  suggestion: Suggestion,
): boolean {
  if (suggestion.action.kind !== 'createChart') return false

  const requested = suggestion.action.chart
  const existing = chart.plan
  return existing.sourceTableId === requested.sourceTableId
    && normalizedChartType(existing.chartType) === normalizedChartType(requested.chartType)
    && existing.config.xAxis === requested.config.xAxis
    && existing.config.yAxis === requested.config.yAxis
    && normalizedAggregation(existing.config) === normalizedAggregation(requested.config)
    && normalizedGroupBy(existing.config) === normalizedGroupBy(requested.config)
    && sameSeries(existing.config.series, requested.config.series)
}

export function removeSatisfiedChartSuggestions(
  suggestions: Suggestion[],
  nodes: Iterable<ProjectNode>,
): Suggestion[] {
  const charts = Array.from(nodes).filter(
    (node): node is ChartNode => node.kind === 'chart',
  )
  if (charts.length === 0) return suggestions

  return suggestions.filter(
    suggestion => !charts.some(chart => chartSatisfiesSuggestion(chart, suggestion)),
  )
}
