/**
 * useViewMode Hook
 * 
 * Manages view mode cycling for table nodes on the canvas.
 * Supports two modes: collapsed (schema) and data preview.
 */

import { useCallback } from 'react'
import type { NodeViewMode } from '@/types'

interface NodeUIState {
  expanded?: boolean
  viewMode?: NodeViewMode
}

interface UseViewModeOptions {
  /** Project nodes record */
  nodes: Record<string, { kind: string; ui: NodeUIState }>
  /** Function to update node UI state */
  updateNodeUI: (nodeId: string, updates: NodeUIState) => void
}

interface UseViewModeReturn {
  /** Get current view mode from UI state */
  getViewMode: (ui: NodeUIState) => NodeViewMode
  /** Get next view mode in cycle */
  getNextViewMode: (current: NodeViewMode) => NodeViewMode
  /** Set a specific view mode */
  handleSetViewMode: (nodeId: string, mode: NodeViewMode) => void
  /** Cycle through view modes */
  handleCycleViewMode: (nodeId: string) => void
  /** Toggle expanded state (legacy) */
  handleToggleExpanded: (nodeId: string) => void
}

/**
 * Hook for managing node view modes.
 */
export function useViewMode({
  nodes,
  updateNodeUI,
}: UseViewModeOptions): UseViewModeReturn {
  // Get current view mode from UI state
  const getViewMode = useCallback((ui: NodeUIState): NodeViewMode => {
    if (ui?.viewMode) {
      // Handle legacy 'stats' mode - map to 'collapsed'
      if ((ui.viewMode as string) === 'stats') return 'collapsed'
      return ui.viewMode
    }
    // Legacy: expanded maps to data now (stats removed)
    if (ui?.expanded) return 'data'
    return 'collapsed'
  }, [])

  // Get next view mode in cycle (only 2 modes now)
  const getNextViewMode = useCallback((current: NodeViewMode): NodeViewMode => {
    switch (current) {
      case 'collapsed': return 'data'
      case 'data': return 'collapsed'
      default: return 'collapsed'
    }
  }, [])

  // Set a specific view mode
  const handleSetViewMode = useCallback((nodeId: string, mode: NodeViewMode) => {
    const node = nodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      updateNodeUI(nodeId, { viewMode: mode, expanded: mode === 'data' })
    }
  }, [nodes, updateNodeUI])

  // Cycle through view modes
  const handleCycleViewMode = useCallback((nodeId: string) => {
    const node = nodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      const currentMode = getViewMode(node.ui)
      const nextMode = getNextViewMode(currentMode)
      handleSetViewMode(nodeId, nextMode)
    }
  }, [nodes, getViewMode, getNextViewMode, handleSetViewMode])

  // Legacy toggle expanded (for backward compatibility)
  const handleToggleExpanded = useCallback((nodeId: string) => {
    const node = nodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      const willExpand = !node.ui.expanded
      updateNodeUI(nodeId, { expanded: willExpand, viewMode: willExpand ? 'data' : 'collapsed' })
    }
  }, [nodes, updateNodeUI])

  return {
    getViewMode,
    getNextViewMode,
    handleSetViewMode,
    handleCycleViewMode,
    handleToggleExpanded,
  }
}
