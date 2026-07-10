import type { Edge } from '@/types'
import type { DependencyGraph } from './dependencyGraphTypes'

export function buildDependencyGraph(edges: Record<string, Edge>): DependencyGraph {
  const upstream = new Map<string, Set<string>>()
  const downstream = new Map<string, Set<string>>()
  for (const { fromNodeId, toNodeId } of Object.values(edges)) {
    if (!downstream.has(fromNodeId)) downstream.set(fromNodeId, new Set())
    downstream.get(fromNodeId)!.add(toNodeId)
    if (!upstream.has(toNodeId)) upstream.set(toNodeId, new Set())
    upstream.get(toNodeId)!.add(fromNodeId)
  }
  return { upstream, downstream }
}

let memoizedEdges: Record<string, Edge> | null = null
let memoizedGraph: DependencyGraph | null = null

export function getCachedDependencyGraph(edges: Record<string, Edge>): DependencyGraph {
  if (edges !== memoizedEdges) {
    memoizedEdges = edges
    memoizedGraph = buildDependencyGraph(edges)
  }
  return memoizedGraph!
}
