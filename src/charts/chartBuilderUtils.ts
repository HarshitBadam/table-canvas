import type { AggregationType, ChartType, ProjectNode, ChartNode } from '@/types'
import { generateId } from '@/lib/utils'

/**
 * Returns true for column names that look like surrogate keys / identifiers,
 * so they are excluded from numeric axis suggestions.
 */
export function isLikelyIdColumn(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'id' || lower.endsWith('_id') || lower.endsWith('id') ||
         lower.startsWith('id_') || lower === 'uuid' || lower === 'guid'
}

export function computeChartPosition(sourceNode: ProjectNode | undefined): { x: number; y: number } {
  return sourceNode
    ? { x: sourceNode.ui.position.x + 350, y: sourceNode.ui.position.y + 100 }
    : { x: 400, y: 200 }
}

export function buildChartNodeSpec(params: {
  chartName: string
  chartType: ChartType
  tableId: string
  position: { x: number; y: number }
  xAxis: string
  yAxis: string
  aggregation: AggregationType
}): ChartNode {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    kind: 'chart',
    name: params.chartName,
    ui: { position: params.position },
    plan: {
      chartType: params.chartType,
      sourceTableId: params.tableId,
      config: { xAxis: params.xAxis, yAxis: params.yAxis || undefined, aggregation: params.aggregation },
    },
    createdAt: now,
    updatedAt: now,
  }
}
