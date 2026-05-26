import type { StateCreator } from 'zustand'
import type { ProjectStoreState, EdgesSliceState } from './types'
import type { Edge } from '@/types'
import { generateId } from '@/lib/utils'
import { wouldCreateCycle as checkCycle } from '@/engine/dependencyGraph'

export const createEdgesSlice: StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  EdgesSliceState
> = (set, get) => ({
  edges: {},

  addEdge: (edge) => {
    const id = generateId()
    set((state) => {
      state.edges[id] = { ...edge, id }
    })
  },

  deleteEdge: (id) => {
    set((state) => {
      delete state.edges[id]
      if (state.selectedEdgeId === id) {
        state.selectedEdgeId = null
      }
    })
  },

  wouldCreateCycle: (sourceId, targetId) => {
    const state = get()
    return checkCycle(state.edges, sourceId, targetId)
  },
})

/**
 * Get edges where the node is the target (incoming).
 */
export function getIncomingEdges(edges: Record<string, Edge>, nodeId: string): Edge[] {
  return Object.values(edges).filter(edge => edge.toNodeId === nodeId)
}

/**
 * Get edges where the node is the source (outgoing).
 */
export function getOutgoingEdges(edges: Record<string, Edge>, nodeId: string): Edge[] {
  return Object.values(edges).filter(edge => edge.fromNodeId === nodeId)
}

/**
 * Get all upstream node IDs for a given node (recursive ancestors).
 */
export function getUpstreamNodeIds(
  edges: Record<string, Edge>,
  nodeId: string,
  visited: Set<string> = new Set()
): string[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)
  
  const incoming = getIncomingEdges(edges, nodeId)
  const directParents = incoming.map(e => e.fromNodeId)
  
  const allAncestors: string[] = [...directParents]
  for (const parentId of directParents) {
    allAncestors.push(...getUpstreamNodeIds(edges, parentId, visited))
  }
  
  return allAncestors
}

/**
 * Get all downstream node IDs for a given node (recursive descendants).
 */
export function getDownstreamNodeIds(
  edges: Record<string, Edge>,
  nodeId: string,
  visited: Set<string> = new Set()
): string[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)
  
  const outgoing = getOutgoingEdges(edges, nodeId)
  const directChildren = outgoing.map(e => e.toNodeId)
  
  const allDescendants: string[] = [...directChildren]
  for (const childId of directChildren) {
    allDescendants.push(...getDownstreamNodeIds(edges, childId, visited))
  }
  
  return allDescendants
}
