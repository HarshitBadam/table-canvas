import type { Edge, ProjectNode } from '@/types'
import { getCachedDependencyGraph } from './dependencyGraphConstruction'

export function wouldCreateCycle(
  edges: Record<string, Edge>,
  sourceId: string,
  targetId: string
): boolean {
  return sourceId === targetId || isReachable(getCachedDependencyGraph(edges).downstream, targetId, sourceId)
}

function isReachable(adjacency: Map<string, Set<string>>, sourceId: string, targetId: string): boolean {
  const visited = new Set<string>()
  const stack = [sourceId]
  while (stack.length) {
    const current = stack.pop()!
    if (current === targetId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) stack.push(neighbor)
    }
  }
  return false
}

type NodeColor = 'white' | 'gray' | 'black'

export function detectCycles(nodes: Record<string, ProjectNode>, edges: Record<string, Edge>): string[] {
  const graph = getCachedDependencyGraph(edges)
  const colors = new Map<string, NodeColor>(Object.keys(nodes).map(nodeId => [nodeId, 'white']))
  const cycleNodes: string[] = []
  const visit = (nodeId: string): boolean => {
    colors.set(nodeId, 'gray')
    for (const childId of graph.downstream.get(nodeId) ?? []) {
      const color = colors.get(childId) ?? 'white'
      if (color === 'gray') {
        cycleNodes.push(nodeId)
        return true
      }
      if (color === 'white' && visit(childId)) {
        cycleNodes.push(nodeId)
        return true
      }
    }
    colors.set(nodeId, 'black')
    return false
  }

  for (const nodeId of Object.keys(nodes)) {
    if (colors.get(nodeId) === 'white') visit(nodeId)
  }
  return cycleNodes
}
