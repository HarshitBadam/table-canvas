/**
 * useNodeDrag Hook
 * 
 * Handles node dragging with throttled edge recomputation.
 * Provides smooth drag experience while maintaining performance.
 */

import { useCallback, useRef } from 'react'
import type { Node, Edge, NodeDragHandler } from 'reactflow'
import { computeSmartEdges, SmartEdge } from '../edgeRouter'

/** Default throttle interval in milliseconds (~60fps) */
const DRAG_THROTTLE_MS = 16

interface UseNodeDragOptions {
  /** Base edges (without handle computation) */
  baseEdges: Edge[]
  /** Function to update nodes state */
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
  /** Function to update edges state */
  setEdges: React.Dispatch<React.SetStateAction<SmartEdge[]>>
  /** Function to persist node position to store */
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  /** Optional throttle interval in ms */
  throttleMs?: number
}

interface UseNodeDragReturn {
  /** Handler for node drag events (throttled) */
  onNodeDrag: NodeDragHandler
  /** Handler for drag stop events (persists position) */
  onNodeDragStop: NodeDragHandler
}

/**
 * Hook for handling node drag with throttled edge updates.
 */
export function useNodeDrag({
  baseEdges,
  setNodes,
  setEdges,
  updateNodePosition,
  throttleMs = DRAG_THROTTLE_MS,
}: UseNodeDragOptions): UseNodeDragReturn {
  const lastDragUpdate = useRef(0)

  // Handle real-time edge updates during node drag (throttled)
  const onNodeDrag: NodeDragHandler = useCallback(
    (_, node) => {
      const now = Date.now()
      if (now - lastDragUpdate.current < throttleMs) return
      lastDragUpdate.current = now

      // Update edges in real-time with new node position
      setNodes(currentNodes => {
        const updatedNodes = currentNodes.map(n =>
          n.id === node.id ? { ...n, position: node.position } : n
        )
        // Recompute edges with updated positions
        const smartEdges = computeSmartEdges(updatedNodes, baseEdges)
        setEdges(smartEdges)
        return updatedNodes
      })
    },
    [baseEdges, setNodes, setEdges, throttleMs]
  )

  // Handle node position changes - persist to store
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_, node) => {
      updateNodePosition(node.id, node.position)
    },
    [updateNodePosition]
  )

  return {
    onNodeDrag,
    onNodeDragStop,
  }
}
