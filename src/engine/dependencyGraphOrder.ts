import type { Edge, ProjectNode } from '@/types'
import { getCachedDependencyGraph } from './dependencyGraphConstruction'

export function getTopologicalOrder(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] | null {
  const graph = getCachedDependencyGraph(edges)
  const result: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return false
    if (visited.has(nodeId)) return true
    visiting.add(nodeId)
    for (const upstreamId of graph.upstream.get(nodeId) ?? []) {
      if (!visit(upstreamId)) return false
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    result.push(nodeId)
    return true
  }
  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId) && !visit(nodeId)) return null
  }
  return result
}

export function getComputationOrder(
  targetNodeId: string,
  _nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] {
  const graph = getCachedDependencyGraph(edges)
  const result: string[] = []
  const visited = new Set<string>()
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return
    for (const upstreamId of graph.upstream.get(nodeId) ?? []) visit(upstreamId)
    visited.add(nodeId)
    result.push(nodeId)
  }
  visit(targetNodeId)
  return result
}
