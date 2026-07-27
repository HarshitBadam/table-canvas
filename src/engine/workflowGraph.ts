import type { Edge, ProjectNode, TransformDef } from '@/types'

export function getTransformSourceTableIds(transform: TransformDef): string[] {
  const ids = transform.type === 'join'
    ? [transform.leftTableId, transform.rightTableId]
    : transform.type === 'union'
      ? transform.sourceTableIds
      : [transform.sourceTableId]
  return [...new Set(ids.filter(Boolean))]
}

interface DirectedEdge {
  fromNodeId: string
  toNodeId: string
}

function canReach(
  adjacency: Map<string, Set<string>>,
  fromNodeId: string,
  targetNodeId: string,
): boolean {
  const visited = new Set<string>()
  const stack = [fromNodeId]
  while (stack.length) {
    const current = stack.pop()!
    if (current === targetNodeId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) stack.push(next)
    }
  }
  return false
}

function connect(adjacency: Map<string, Set<string>>, edge: DirectedEdge): void {
  const targets = adjacency.get(edge.fromNodeId) ?? new Set<string>()
  targets.add(edge.toNodeId)
  adjacency.set(edge.fromNodeId, targets)
}

export function hasEdgeCycle(edges: Record<string, Edge>): boolean {
  const adjacency = new Map<string, Set<string>>()
  for (const edge of Object.values(edges)) {
    if (edge.fromNodeId === edge.toNodeId) return true
    connect(adjacency, edge)
  }
  for (const [fromNodeId, targets] of adjacency) {
    for (const toNodeId of targets) {
      if (canReach(adjacency, toNodeId, fromNodeId)) return true
    }
  }
  return false
}

/**
 * Inserts edges in `order`, skipping any edge that would close a cycle. Edge ids
 * missing from `order` are appended in sorted order so nothing is dropped silently.
 */
export function removeCyclicEdges<T extends DirectedEdge>(
  edges: Record<string, T>,
  order: string[],
): { edges: Record<string, T>; removedEdgeIds: string[] } {
  const visitOrder = [...order, ...Object.keys(edges).sort()]
  const adjacency = new Map<string, Set<string>>()
  const accepted: Record<string, T> = {}
  const removedEdgeIds: string[] = []
  const seen = new Set<string>()

  for (const edgeId of visitOrder) {
    const edge = edges[edgeId]
    if (!edge || seen.has(edgeId)) continue
    seen.add(edgeId)
    if (
      edge.fromNodeId === edge.toNodeId
      || canReach(adjacency, edge.toNodeId, edge.fromNodeId)
    ) {
      removedEdgeIds.push(edgeId)
      continue
    }
    accepted[edgeId] = edge
    connect(adjacency, edge)
  }

  return { edges: accepted, removedEdgeIds }
}

export function getDependentNodeIds(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  rootNodeId: string,
): Set<string> {
  const affected = new Set<string>([rootNodeId])
  let changed = true

  while (changed) {
    changed = false

    for (const edge of Object.values(edges)) {
      if (affected.has(edge.fromNodeId) && !affected.has(edge.toNodeId)) {
        affected.add(edge.toNodeId)
        changed = true
      }
    }

    for (const node of Object.values(nodes)) {
      if (affected.has(node.id)) continue
      const references = node.kind === 'chart'
        ? [node.plan.sourceTableId]
        : node.kind === 'derived_table'
          ? [...node.plan.upstreamNodeIds, ...getTransformSourceTableIds(node.plan.transformDef)]
          : []
      if (references.some((id) => affected.has(id))) {
        affected.add(node.id)
        changed = true
      }
    }
  }

  affected.delete(rootNodeId)
  return affected
}
