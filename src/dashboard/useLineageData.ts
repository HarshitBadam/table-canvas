import { useMemo } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import {
  useTableNodes,
  useChartNodes,
  type LineageNode,
  type LineageEdge,
} from './dashboardHelpers'

export function useLineageData(): {
  nodes: LineageNode[]
  edges: LineageEdge[]
} {
  const tableNodes = useTableNodes()
  const chartNodes = useChartNodes()
  const storeEdges = useProjectStore((state) => state.edges)
  const tableData = useDataStore((state) => state.tableData)

  return useMemo(() => {
    const tableLineageNodes: LineageNode[] = tableNodes.map(table => {
      const data = tableData[table.id]
      return {
        id: table.id,
        name: table.name,
        kind: table.kind as 'source_table' | 'derived_table',
        rowCount: data?.rows?.length || table.schema?.rowCount || 0,
      }
    })

    const chartLineageNodes: LineageNode[] = chartNodes.map(chart => ({
      id: chart.id,
      name: chart.name || 'Chart',
      kind: 'chart' as const,
      rowCount: 0,
      chartType: chart.plan?.chartType || 'bar',
    }))

    const nodes = [...tableLineageNodes, ...chartLineageNodes]
    const nodeIds = new Set(nodes.map(n => n.id))

    const edges: LineageEdge[] = Object.values(storeEdges)
      .filter(edge => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
      .map(edge => ({
        id: edge.id,
        from: edge.fromNodeId,
        to: edge.toNodeId,
      }))

    return { nodes, edges }
  }, [tableNodes, chartNodes, storeEdges, tableData])
}
