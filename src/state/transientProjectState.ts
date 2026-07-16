import type { ProjectNode } from '@/types'

export function withoutTransientComputeState(
  nodes: Record<string, ProjectNode>,
): Record<string, ProjectNode> {
  return Object.fromEntries(Object.entries(nodes).map(([id, node]) => {
    if (node.kind !== 'source_table' && node.kind !== 'derived_table') {
      return [id, node]
    }
    const cacheInfo = node.cacheInfo ? { ...node.cacheInfo } : undefined
    if (cacheInfo) delete cacheInfo.isComputing
    return [id, { ...node, cacheInfo }]
  }))
}
