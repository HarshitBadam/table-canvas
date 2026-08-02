import type { TableRuntimePhase } from '@/types'
import { getNodeCacheInfo, updateNodeCacheInfo } from './tableRuntimeStore'

interface PendingGate {
  generation: number
  promise: Promise<void>
  release: () => void
}

const gates = new Map<string, PendingGate>()

function nextGeneration(tableId: string): number {
  return (getNodeCacheInfo(tableId)?.operationGeneration ?? 0) + 1
}

export function beginTableOperation(
  tableId: string,
  phase: Exclude<TableRuntimePhase, 'ready' | 'error'>,
): number {
  cancelTableOperation(tableId)
  const generation = nextGeneration(tableId)
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = () => { resolve() }
  })
  gates.set(tableId, { generation, promise, release })
  updateNodeCacheInfo(tableId, {
    phase,
    operationGeneration: generation,
    isDirty: true,
    isComputing: phase === 'materializing',
    error: undefined,
    progress: undefined,
  })
  return generation
}

export function updateTableOperation(
  tableId: string,
  generation: number,
  updates: {
    phase?: Exclude<TableRuntimePhase, 'ready' | 'error'>
    progress?: { completed: number; total?: number; label?: string }
  },
): boolean {
  if (getNodeCacheInfo(tableId)?.operationGeneration !== generation) return false
  updateNodeCacheInfo(tableId, {
    ...updates,
    isComputing: updates.phase === 'materializing' ? true : undefined,
  })
  // Keep waiters blocked until complete/fail so import and ensureTableMaterialized
  // cannot double-load the same large table on the shared mutation queue.
  return true
}

export function completeTableOperation(tableId: string, generation: number): boolean {
  if (getNodeCacheInfo(tableId)?.operationGeneration !== generation) return false
  releaseTableWaiters(tableId, generation)
  updateNodeCacheInfo(tableId, {
    phase: 'ready',
    isComputing: false,
    isDirty: false,
    error: undefined,
    progress: undefined,
  })
  return true
}

export function failTableOperation(
  tableId: string,
  generation: number,
  error: string,
): boolean {
  if (getNodeCacheInfo(tableId)?.operationGeneration !== generation) return false
  releaseTableWaiters(tableId, generation)
  updateNodeCacheInfo(tableId, {
    phase: 'error',
    isComputing: false,
    isDirty: true,
    error,
    progress: undefined,
  })
  return true
}

export function cancelTableOperation(tableId: string): void {
  const gate = gates.get(tableId)
  gate?.release()
  gates.delete(tableId)
  const cache = getNodeCacheInfo(tableId)
  if (!cache) return
  updateNodeCacheInfo(tableId, {
    operationGeneration: (cache.operationGeneration ?? 0) + 1,
    isComputing: false,
    progress: undefined,
  })
}

/** Release every in-flight gate (project switch / full runtime reset). */
export function clearAllTableOperations(): void {
  for (const [tableId, gate] of gates) {
    gate.release()
    gates.delete(tableId)
  }
}

export async function waitForTableOperation(tableId: string): Promise<void> {
  const gate = gates.get(tableId)
  if (gate) await gate.promise
}

export function isTableOperationCurrent(tableId: string, generation: number): boolean {
  return getNodeCacheInfo(tableId)?.operationGeneration === generation
}

function releaseTableWaiters(tableId: string, generation: number): void {
  const gate = gates.get(tableId)
  if (!gate || gate.generation !== generation) return
  gates.delete(tableId)
  gate.release()
}
