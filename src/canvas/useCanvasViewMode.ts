import { useCallback } from 'react'
import type { NodeViewMode } from '@/types'
import { useProjectStore } from '@/state/projectStore'

interface UseCanvasViewModeResult {
  getViewMode: (ui: { expanded?: boolean; viewMode?: NodeViewMode }) => NodeViewMode
  getNextViewMode: (current: NodeViewMode) => NodeViewMode
  handleSetViewMode: (nodeId: string, mode: NodeViewMode) => void
  handleCycleViewMode: (nodeId: string) => void
}

/**
 * Encapsulates node view-mode state machine for the canvas.
 * Provides stable callbacks for reading and cycling a node's view mode
 * (collapsed ↔ data).
 */
export function useCanvasViewMode(): UseCanvasViewModeResult {
  const projectNodes = useProjectStore((state) => state.nodes)
  const updateNodeUI = useProjectStore((state) => state.updateNodeUI)

  const getViewMode = useCallback(
    (ui: { expanded?: boolean; viewMode?: NodeViewMode }): NodeViewMode => {
      if (ui?.viewMode) {
        // 'stats' was a legacy mode — treat as collapsed
        if ((ui.viewMode as string) === 'stats') return 'collapsed'
        return ui.viewMode
      }
      if (ui?.expanded) return 'data'
      return 'collapsed'
    },
    [],
  )

  const getNextViewMode = useCallback((current: NodeViewMode): NodeViewMode => {
    switch (current) {
      case 'collapsed':
        return 'data'
      case 'data':
        return 'collapsed'
      default:
        return 'collapsed'
    }
  }, [])

  const handleSetViewMode = useCallback(
    (nodeId: string, mode: NodeViewMode) => {
      const node = projectNodes[nodeId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        updateNodeUI(nodeId, { viewMode: mode, expanded: mode === 'data' })
      }
    },
    [projectNodes, updateNodeUI],
  )

  const handleCycleViewMode = useCallback(
    (nodeId: string) => {
      const node = projectNodes[nodeId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        const currentMode = getViewMode(node.ui)
        const nextMode = getNextViewMode(currentMode)
        handleSetViewMode(nodeId, nextMode)
      }
    },
    [projectNodes, getViewMode, getNextViewMode, handleSetViewMode],
  )

  return { getViewMode, getNextViewMode, handleSetViewMode, handleCycleViewMode }
}
