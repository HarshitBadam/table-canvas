import type { Edge, ProjectNode } from '@/types'
import { getCachedDependencyGraph } from './dependencyGraphConstruction'

export function getAllDescendants(nodeId: string, edges: Record<string, Edge>): Set<string> {
  return collectReachable(nodeId, getCachedDependencyGraph(edges).downstream)
}

export function getAllAncestors(nodeId: string, edges: Record<string, Edge>): Set<string> {
  return collectReachable(nodeId, getCachedDependencyGraph(edges).upstream)
}

function collectReachable(nodeId: string, adjacency: Map<string, Set<string>>): Set<string> {
  const result = new Set<string>()
  const stack = [nodeId]
  while (stack.length) {
    const current = stack.pop()!
    for (const next of adjacency.get(current) ?? []) {
      if (!result.has(next)) {
        result.add(next)
        stack.push(next)
      }
    }
  }
  return result
}

export function getDirectUpstream(nodeId: string, edges: Record<string, Edge>): Set<string> {
  return getCachedDependencyGraph(edges).upstream.get(nodeId) ?? new Set()
}

export function getDirectDownstream(nodeId: string, edges: Record<string, Edge>): Set<string> {
  return getCachedDependencyGraph(edges).downstream.get(nodeId) ?? new Set()
}

export function getNodeDepth(
  nodeId: string,
  edges: Record<string, Edge>,
  cache: Map<string, number> = new Map()
): number {
  const cached = cache.get(nodeId)
  if (cached !== undefined) return cached
  const upstream = getCachedDependencyGraph(edges).upstream.get(nodeId)
  if (!upstream?.size) {
    cache.set(nodeId, 0)
    return 0
  }
  let maxUpstreamDepth = 0
  for (const upstreamId of upstream) {
    maxUpstreamDepth = Math.max(maxUpstreamDepth, getNodeDepth(upstreamId, edges, cache))
  }
  const depth = maxUpstreamDepth + 1
  cache.set(nodeId, depth)
  return depth
}

export function isAncestorOf(nodeA: string, nodeB: string, edges: Record<string, Edge>): boolean {
  return getAllAncestors(nodeB, edges).has(nodeA)
}

export function isDescendantOf(nodeA: string, nodeB: string, edges: Record<string, Edge>): boolean {
  return getAllDescendants(nodeB, edges).has(nodeA)
}

export function getRootNodes(nodes: Record<string, ProjectNode>, edges: Record<string, Edge>): string[] {
  const graph = getCachedDependencyGraph(edges)
  return Object.keys(nodes).filter(nodeId => !graph.upstream.get(nodeId)?.size)
}

export function getLeafNodes(nodes: Record<string, ProjectNode>, edges: Record<string, Edge>): string[] {
  const graph = getCachedDependencyGraph(edges)
  return Object.keys(nodes).filter(nodeId => !graph.downstream.get(nodeId)?.size)
}
