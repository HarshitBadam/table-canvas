import { generateId } from '@/lib/utils'
import type { Edge, Patches, ProjectNode } from '@/types'
import type { ProjectStoreState } from './types'

interface NodeDuplicate {
  id: string
  node: ProjectNode
  patches?: Patches
  incomingEdges: Edge[]
}

export function prepareNodeDuplicate(
  state: ProjectStoreState,
  sourceId: string,
): NodeDuplicate | undefined {
  const sourceNode = state.nodes[sourceId]
  if (!sourceNode) return undefined

  const id = generateId()
  const now = new Date().toISOString()
  const names = new Set(Object.values(state.nodes).map(node => node.name))
  const baseName = `${sourceNode.name} copy`
  let name = baseName
  let suffix = 2
  while (names.has(name)) {
    name = `${baseName} ${suffix}`
    suffix += 1
  }

  const node = structuredClone(sourceNode)
  node.id = id
  node.name = name
  node.ui.position = {
    x: sourceNode.ui.position.x + 32,
    y: sourceNode.ui.position.y + 32,
  }
  node.createdAt = now
  node.updatedAt = now
  if (node.kind === 'source_table' || node.kind === 'derived_table') {
    node.cacheInfo = {
      ...node.cacheInfo,
      isDirty: true,
      isComputing: false,
      error: undefined,
      currentVersionHash: undefined,
    }
  }

  return {
    id,
    node,
    patches: state.patches[sourceId]
      ? structuredClone(state.patches[sourceId])
      : undefined,
    incomingEdges: Object.values(state.edges)
      .filter(edge => edge.toNodeId === sourceId)
      .map(edge => structuredClone(edge)),
  }
}

export function applyNodeDuplicate(
  state: ProjectStoreState,
  duplicate: NodeDuplicate,
) {
  state.nodes[duplicate.id] = duplicate.node
  if (duplicate.patches) {
    state.patches[duplicate.id] = duplicate.patches
  }
  duplicate.incomingEdges.forEach(edge => {
    const edgeId = generateId()
    state.edges[edgeId] = {
      ...edge,
      id: edgeId,
      toNodeId: duplicate.id,
    }
  })
  state.selectedNodeId = duplicate.id
}
