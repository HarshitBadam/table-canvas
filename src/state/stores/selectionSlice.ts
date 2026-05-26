import type { StateCreator } from 'zustand'
import type { ProjectStoreState, SelectionSliceState } from './types'

export const createSelectionSlice: StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  SelectionSliceState
> = (set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,

  selectNode: (id) => {
    set((state) => {
      state.selectedNodeId = id
      state.selectedEdgeId = null
    })
  },

  selectEdge: (id) => {
    set((state) => {
      state.selectedEdgeId = id
      state.selectedNodeId = null
    })
  },
})
