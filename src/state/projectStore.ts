/**
 * Project Store
 * 
 * Composed Zustand store managing project state.
 * Built from domain slices for better organization and maintainability.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { generateId } from '@/lib/utils'
import type { ProjectStoreState } from './stores/types'
import { createNodesSlice } from './stores/nodesSlice'
import { createEdgesSlice } from './stores/edgesSlice'
import { createPatchesSlice } from './stores/patchesSlice'
import { createHistorySlice } from './stores/historySlice'
import { createSelectionSlice } from './stores/selectionSlice'

// ============================================================================
// Store Implementation
// ============================================================================

export const useProjectStore = create<ProjectStoreState>()(
  immer((...args) => {
    // Note: set and get are available via args and passed to slices
    
    return {
      // Project metadata
      projectId: generateId(),
      projectName: 'Untitled Project',
      
      // Compose all slices
      ...createNodesSlice(...args),
      ...createEdgesSlice(...args),
      ...createPatchesSlice(...args),
      ...createHistorySlice(...args),
      ...createSelectionSlice(...args),
    }
  })
)

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook to check if undo is available
 */
export const useCanUndo = () => useProjectStore((state) => state.history.past.length > 0)

/**
 * Hook to check if redo is available
 */
export const useCanRedo = () => useProjectStore((state) => state.history.future.length > 0)

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

export type { ProjectStoreState } from './stores/types'
