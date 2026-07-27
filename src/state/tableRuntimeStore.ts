import { create } from 'zustand'
import type { CacheInfo, TableNode, TableSchema } from '@/types'

/**
 * Per-tab derived state for table nodes. None of this is persisted or shared: it
 * describes what this tab's DuckDB instance currently holds. Keeping it out of the
 * project document is what lets a tab view a project without writing to it.
 */
interface TableRuntimeState {
  cacheInfo: Record<string, CacheInfo>
  /** Schema as last materialized here; overrides the document copy for readers. */
  schemas: Record<string, TableSchema>
  updateCacheInfo: (nodeId: string, updates: Partial<CacheInfo>) => void
  markNodesDirty: (nodeIds: Iterable<string>) => void
  invalidateNodes: (nodeIds: Iterable<string>) => void
  clearNodeError: (nodeId: string) => void
  setMaterializedSchema: (nodeId: string, schema: TableSchema) => void
  forgetNodes: (nodeIds: Iterable<string>) => void
  resetRuntime: () => void
}

export const useTableRuntimeStore = create<TableRuntimeState>()((set) => ({
  cacheInfo: {},
  schemas: {},

  updateCacheInfo: (nodeId, updates) => {
    set(state => ({
      cacheInfo: {
        ...state.cacheInfo,
        [nodeId]: { ...state.cacheInfo[nodeId], ...updates },
      },
    }))
  },

  markNodesDirty: (nodeIds) => {
    set(state => ({ cacheInfo: applyDirty(state.cacheInfo, nodeIds, false) }))
  },

  invalidateNodes: (nodeIds) => {
    set(state => ({ cacheInfo: applyDirty(state.cacheInfo, nodeIds, true) }))
  },

  clearNodeError: (nodeId) => {
    set(state => (
      state.cacheInfo[nodeId]?.error === undefined
        ? state
        : {
            cacheInfo: {
              ...state.cacheInfo,
              [nodeId]: { ...state.cacheInfo[nodeId], error: undefined },
            },
          }
    ))
  },

  setMaterializedSchema: (nodeId, schema) => {
    set(state => ({ schemas: { ...state.schemas, [nodeId]: schema } }))
  },

  forgetNodes: (nodeIds) => {
    set((state) => {
      const cacheInfo = { ...state.cacheInfo }
      const schemas = { ...state.schemas }
      for (const nodeId of nodeIds) {
        delete cacheInfo[nodeId]
        delete schemas[nodeId]
      }
      return { cacheInfo, schemas }
    })
  },

  resetRuntime: () => set({ cacheInfo: {}, schemas: {} }),
}))

function applyDirty(
  current: Record<string, CacheInfo>,
  nodeIds: Iterable<string>,
  discardVersionHash: boolean,
): Record<string, CacheInfo> {
  const next = { ...current }
  for (const nodeId of nodeIds) {
    const previous = next[nodeId]
    next[nodeId] = {
      ...previous,
      isDirty: true,
      error: undefined,
      dataRevision: (previous?.dataRevision ?? 0) + 1,
      ...(discardVersionHash
        ? { isComputing: false, currentVersionHash: undefined }
        : {}),
    }
  }
  return next
}

export function getNodeCacheInfo(nodeId: string): CacheInfo | undefined {
  return useTableRuntimeStore.getState().cacheInfo[nodeId]
}

export function updateNodeCacheInfo(
  nodeId: string,
  updates: Partial<CacheInfo>,
): void {
  useTableRuntimeStore.getState().updateCacheInfo(nodeId, updates)
}

export function getMaterializedSchema(nodeId: string): TableSchema | undefined {
  return useTableRuntimeStore.getState().schemas[nodeId]
}

/** The schema readers should trust: this tab's materialized copy, else the document. */
export function effectiveTableSchema(
  node: TableNode | undefined,
): TableSchema | undefined {
  if (!node) return undefined
  return useTableRuntimeStore.getState().schemas[node.id] ?? node.schema
}

export function useNodeCacheInfo(nodeId: string | null | undefined): CacheInfo | undefined {
  return useTableRuntimeStore(state => (nodeId ? state.cacheInfo[nodeId] : undefined))
}
