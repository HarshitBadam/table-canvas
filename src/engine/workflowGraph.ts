import type { Edge, ProjectNode, TransformDef } from '@/types'

export function getTransformSourceTableIds(transform: TransformDef): string[] {
  const ids = transform.type === 'join'
    ? [transform.leftTableId, transform.rightTableId]
    : transform.type === 'union'
      ? transform.sourceTableIds
      : [transform.sourceTableId]
  return [...new Set(ids.filter(Boolean))]
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
