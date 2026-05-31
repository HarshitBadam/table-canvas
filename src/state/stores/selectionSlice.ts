import type { StateCreator } from 'zustand'
import type { ProjectStoreState, SelectionSliceState } from './types'

export const createSelectionSlice: StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  SelectionSliceState
> = (set) => ({
  selectedNodeId: null,

  selectNode: (id) => {
    set((state) => {
      state.selectedNodeId = id
    })
  },
})
