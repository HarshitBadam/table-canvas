import { useCallback } from 'react'
import type { NodeViewMode } from '@/types'
import { useProjectStore } from '@/state/projectStore'
import { loadProfileForTable } from '@/lib/profiling'

interface UseCanvasViewModeResult {
  handleSetViewMode: (nodeId: string, mode: NodeViewMode) => void
}

/**
 * Updates the display state for table nodes on the canvas.
 */
export function useCanvasViewMode(): UseCanvasViewModeResult {
  const projectNodes = useProjectStore((state) => state.nodes)
  const updateNodeUI = useProjectStore((state) => state.updateNodeUI)

  const handleSetViewMode = useCallback(
    (nodeId: string, mode: NodeViewMode) => {
      const node = projectNodes[nodeId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        updateNodeUI(nodeId, { viewMode: mode })
        if (mode === 'data') loadProfileForTable(nodeId)
      }
    },
    [projectNodes, updateNodeUI],
  )

  return { handleSetViewMode }
}
