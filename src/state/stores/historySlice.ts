import type { StateCreator } from 'zustand'
import type { ProjectStoreState, HistorySliceState, HistoryEntry } from './types'
import type { Patches, ProjectNode } from '@/types'
import { useDataStore } from '@/state/dataStore'
import { invalidateMaterializations } from '@/engine/materializationCoordinator'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
const MAX_UNDO_HISTORY = 50

/**
 * Restoring a snapshot brings back its old `updatedAt` values, which would make the
 * cross-device merge treat an undo as the older edit. Re-stamp the restored tables so
 * an explicit user action wins.
 */
function restoreTableState(nodes: Record<string, ProjectNode>) {
  const restamped = new Date().toISOString()
  const tableIds: string[] = []
  Object.values(nodes).forEach((node) => {
    if (node.kind !== 'source_table' && node.kind !== 'derived_table') return
    node.updatedAt = restamped
    tableIds.push(node.id)
  })
  useTableRuntimeStore.getState().invalidateNodes(tableIds)
}

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
      state.history.future = []

      if (state.history.past.length > MAX_UNDO_HISTORY) {
        state.history.past.shift()
      }
    })
  },

  undo: () => {
    const state = get()
    if (state.history.past.length === 0) return
    invalidateMaterializations()

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

      state.patches = {}
      Object.entries(previous.patches).forEach(([tableId, patches]) => {
        state.patches[tableId] = {
          cellPatches: (patches as Patches).cellPatches,
          deletedRows: new Set((patches as unknown as { deletedRows: string[] }).deletedRows || []),
          insertedRows: (patches as Patches).insertedRows,
          highlightedCells: new Set((patches as unknown as { highlightedCells: string[] }).highlightedCells || []),
        }
      })
      if (state.selectedNodeId && !state.nodes[state.selectedNodeId]) {
        state.selectedNodeId = null
      }
      restoreTableState(state.nodes)
    })
    useDataStore.setState({ tableData: {} })
  },

  redo: () => {
    const state = get()
    if (state.history.future.length === 0) return
    invalidateMaterializations()

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

      state.patches = {}
      Object.entries(next.patches).forEach(([tableId, patches]) => {
        state.patches[tableId] = {
          cellPatches: (patches as Patches).cellPatches,
          deletedRows: new Set((patches as unknown as { deletedRows: string[] }).deletedRows || []),
          insertedRows: (patches as Patches).insertedRows,
          highlightedCells: new Set((patches as unknown as { highlightedCells: string[] }).highlightedCells || []),
        }
      })
      if (state.selectedNodeId && !state.nodes[state.selectedNodeId]) {
        state.selectedNodeId = null
      }
      restoreTableState(state.nodes)
    })
    useDataStore.setState({ tableData: {} })
  },

  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,
})
