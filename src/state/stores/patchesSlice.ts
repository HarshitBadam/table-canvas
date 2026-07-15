import type { StateCreator } from 'zustand'
import type { ProjectStoreState, PatchesSliceState } from './types'
import type { Patches } from '@/types'

export const createInitialPatches = (): Patches => ({
  cellPatches: {},
  deletedRows: new Set(),
  insertedRows: [],
  highlightedCells: new Set(),
})

export const createPatchesSlice: StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  PatchesSliceState
> = (set, get) => ({
  patches: {},

  setCellValue: (tableId, rowId, columnId, value) => {
    set((state) => {
      if (!state.patches[tableId]) {
        state.patches[tableId] = createInitialPatches()
      }

      const patches = state.patches[tableId]
      if (!patches.cellPatches[columnId]) {
        patches.cellPatches[columnId] = {}
      }
      patches.cellPatches[columnId][rowId] = value
    })

    get().markNodeAndDescendantsDirty(tableId)
  },

  deleteRow: (tableId, rowId) => {
    set((state) => {
      if (!state.patches[tableId]) {
        state.patches[tableId] = createInitialPatches()
      }

      state.patches[tableId].deletedRows.add(rowId)

      const node = state.nodes[tableId]
      if (node) {
        node.updatedAt = new Date().toISOString()
      }
    })

    get().markNodeAndDescendantsDirty(tableId)
  },

  insertRow: (tableId, rowId, values, index) => {
    set((state) => {
      if (!state.patches[tableId]) {
        state.patches[tableId] = createInitialPatches()
      }

      state.patches[tableId].insertedRows.push({
        rowId,
        values,
        insertedAt: index,
      })

      const node = state.nodes[tableId]
      if (node) {
        node.updatedAt = new Date().toISOString()
      }
    })

    get().markNodeAndDescendantsDirty(tableId)
  },

  getPatches: (tableId) => {
    return get().patches[tableId]
  },

  toggleCellHighlight: (tableId, rowId, columnId) => {
    set((state) => {
      if (!state.patches[tableId]) {
        state.patches[tableId] = createInitialPatches()
      }

      const patches = state.patches[tableId]
      if (!patches.highlightedCells) {
        patches.highlightedCells = new Set()
      }

      const cellKey = `${rowId}:${columnId}`
      if (patches.highlightedCells.has(cellKey)) {
        patches.highlightedCells.delete(cellKey)
      } else {
        patches.highlightedCells.add(cellKey)
      }
    })
  },

  clearHighlights: (tableId) => {
    set((state) => {
      if (state.patches[tableId]) {
        state.patches[tableId].highlightedCells = new Set()
      }
    })
  },

  setHighlights: (tableId, cells) => {
    set((state) => {
      if (!state.patches[tableId]) {
        state.patches[tableId] = createInitialPatches()
      }
      state.patches[tableId].highlightedCells = new Set(cells)
    })
  },

  isCellHighlighted: (tableId, rowId, columnId) => {
    const patches = get().patches[tableId]
    if (!patches?.highlightedCells) return false
    return patches.highlightedCells.has(`${rowId}:${columnId}`)
  },
})
