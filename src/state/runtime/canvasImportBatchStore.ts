import { create } from 'zustand'

import { generateId } from '@/lib/utils'

interface CanvasImportBatch {
  id: string
  projectId: string
  nodeIds: string[]
}

interface CanvasImportBatchState {
  activeBatches: Record<string, CanvasImportBatch>
  completedBatches: CanvasImportBatch[]
}

export const useCanvasImportBatchStore = create<CanvasImportBatchState>()(() => ({
  activeBatches: {},
  completedBatches: [],
}))

export function beginCanvasImportBatch(projectId: string): string {
  const id = generateId()
  useCanvasImportBatchStore.setState(state => ({
    activeBatches: {
      ...state.activeBatches,
      [id]: { id, projectId, nodeIds: [] },
    },
  }))
  return id
}

export function registerCanvasImportNode(batchId: string, nodeId: string): void {
  useCanvasImportBatchStore.setState((state) => {
    const batch = state.activeBatches[batchId]
    if (!batch || batch.nodeIds.includes(nodeId)) return state
    return {
      activeBatches: {
        ...state.activeBatches,
        [batchId]: { ...batch, nodeIds: [...batch.nodeIds, nodeId] },
      },
    }
  })
}

export function completeCanvasImportBatch(batchId: string): void {
  useCanvasImportBatchStore.setState((state) => {
    const batch = state.activeBatches[batchId]
    if (!batch) return state
    const activeBatches = { ...state.activeBatches }
    delete activeBatches[batchId]
    return {
      activeBatches,
      completedBatches: batch.nodeIds.length > 0
        ? [...state.completedBatches, batch]
        : state.completedBatches,
    }
  })
}

export function cancelCanvasImportBatch(batchId: string): void {
  useCanvasImportBatchStore.setState((state) => {
    if (!state.activeBatches[batchId]) return state
    const activeBatches = { ...state.activeBatches }
    delete activeBatches[batchId]
    return { activeBatches }
  })
}

export function acknowledgeCanvasImportBatches(batchIds: Iterable<string>): void {
  const acknowledged = new Set(batchIds)
  if (acknowledged.size === 0) return
  useCanvasImportBatchStore.setState(state => ({
    completedBatches: state.completedBatches.filter(batch => !acknowledged.has(batch.id)),
  }))
}

export function hasActiveCanvasImportBatch(projectId?: string): boolean {
  return Object.values(useCanvasImportBatchStore.getState().activeBatches)
    .some(batch => projectId === undefined || batch.projectId === projectId)
}

export function resetCanvasImportBatches(): void {
  useCanvasImportBatchStore.setState({ activeBatches: {}, completedBatches: [] })
}
