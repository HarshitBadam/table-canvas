import type { StateCreator } from 'zustand'
import type { ProjectStoreState, EdgesSliceState } from './types'
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
    })
  },

  wouldCreateCycle: (sourceId, targetId) => {
    const state = get()
    return checkCycle(state.edges, sourceId, targetId)
  },
})

