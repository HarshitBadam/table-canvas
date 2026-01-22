/**
 * useNodeSelection Hook
 * 
 * Selection state management for nodes and edges.
 */

import { useCallback } from 'react'
import { useProjectStore } from '../projectStore'
import type { ProjectNode } from '@/types'

/**
 * Get the currently selected node ID
 */
export function useSelectedNodeId(): string | null {
  return useProjectStore((state) => state.selectedNodeId)
}

/**
 * Get the currently selected node
 */
export function useSelectedNode(): ProjectNode | null {
  return useProjectStore((state) => 
    state.selectedNodeId ? state.nodes[state.selectedNodeId] : null
  )
}

/**
 * Get the currently selected edge ID
 */
export function useSelectedEdgeId(): string | null {
  return useProjectStore((state) => state.selectedEdgeId)
}

/**
 * Hook for managing node selection
 */
export function useNodeSelection() {
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const selectedEdgeId = useProjectStore((state) => state.selectedEdgeId)
  const selectNode = useProjectStore((state) => state.selectNode)
  const selectEdge = useProjectStore((state) => state.selectEdge)

  const clearSelection = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  const isNodeSelected = useCallback((nodeId: string) => {
    return selectedNodeId === nodeId
  }, [selectedNodeId])

  const isEdgeSelected = useCallback((edgeId: string) => {
    return selectedEdgeId === edgeId
  }, [selectedEdgeId])

  return {
    selectedNodeId,
    selectedEdgeId,
    selectNode,
    selectEdge,
    clearSelection,
    isNodeSelected,
    isEdgeSelected,
  }
}

/**
 * Check if a specific node is selected
 */
export function useIsNodeSelected(nodeId: string): boolean {
  return useProjectStore((state) => state.selectedNodeId === nodeId)
}
