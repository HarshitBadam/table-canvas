import type { StateCreator } from 'zustand'
import type { ProjectStoreState, HistorySliceState, HistoryEntry } from './types'
import type { Patches } from '@/types'
const MAX_UNDO_HISTORY = 50

export const createHistorySlice: StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  HistorySliceState
> = (set, get) => ({
  history: {
    past: [],
    future: [],
  },

  saveSnapshot: (description) => {
    set((state) => {
      const snapshot: HistoryEntry = {
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        edges: JSON.parse(JSON.stringify(state.edges)),
        patches: JSON.parse(JSON.stringify(state.patches, (_, v) =>
          v instanceof Set ? [...v] : v
        )),
        description,
      }

      state.history.past.push(snapshot)
      state.history.future = [] // Clear redo stack on new action

      // Limit history size
      if (state.history.past.length > MAX_UNDO_HISTORY) {
        state.history.past.shift()
      }
    })
  },

  undo: () => {
    const state = get()
    if (state.history.past.length === 0) return

    set((state) => {
      const current: HistoryEntry = {
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        edges: JSON.parse(JSON.stringify(state.edges)),
        patches: JSON.parse(JSON.stringify(state.patches, (_, v) =>
          v instanceof Set ? [...v] : v
        )),
        description: 'Current state',
      }

      state.history.future.push(current)

      const previous = state.history.past.pop()!
      state.nodes = previous.nodes
      state.edges = previous.edges

      // Restore patches with Set conversion
      state.patches = {}
      Object.entries(previous.patches).forEach(([tableId, patches]) => {
        state.patches[tableId] = {
          cellPatches: (patches as Patches).cellPatches,
          deletedRows: new Set((patches as unknown as { deletedRows: string[] }).deletedRows || []),
          insertedRows: (patches as Patches).insertedRows,
          highlightedCells: new Set((patches as unknown as { highlightedCells: string[] }).highlightedCells || []),
        }
      })
    })
  },

  redo: () => {
    const state = get()
    if (state.history.future.length === 0) return

    set((state) => {
      const current: HistoryEntry = {
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        edges: JSON.parse(JSON.stringify(state.edges)),
        patches: JSON.parse(JSON.stringify(state.patches, (_, v) =>
          v instanceof Set ? [...v] : v
        )),
        description: 'Current state',
      }

      state.history.past.push(current)

      const next = state.history.future.pop()!
      state.nodes = next.nodes
      state.edges = next.edges

      // Restore patches with Set conversion
      state.patches = {}
      Object.entries(next.patches).forEach(([tableId, patches]) => {
        state.patches[tableId] = {
          cellPatches: (patches as Patches).cellPatches,
          deletedRows: new Set((patches as unknown as { deletedRows: string[] }).deletedRows || []),
          insertedRows: (patches as Patches).insertedRows,
          highlightedCells: new Set((patches as unknown as { highlightedCells: string[] }).highlightedCells || []),
        }
      })
    })
  },

  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,
})
