import type { StateCreator } from 'zustand'
import type { ProjectStoreState, HistorySliceState, HistoryEntry } from './types'
import type { Edge, Patches, ProjectNode, TableNode } from '@/types'
import { useDataStore } from '@/state/dataStore'
import { invalidateMaterializations } from '@/engine/materializationCoordinator'
import { cancelTableOperation } from '@/state/tableOperationCoordinator'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import { computePatchesVersion } from '@/engine/cacheUtils'
import { getDependentNodeIds } from '@/engine/workflowGraph'
import { getStorageScope } from '@/persistence/storageScope'
import {
  fileRefsInNodes,
  queueHistoryFileCleanup,
  retainHistoryFileRefs,
} from '@/persistence/historyFileCleanup'

const MAX_UNDO_HISTORY = 50
const MAX_HISTORY_BYTES = 20 * 1024 * 1024
let transactionSequence = 0

function isTableNode(node: ProjectNode | undefined): node is TableNode {
  return node?.kind === 'source_table' || node?.kind === 'derived_table'
}

function cloneEntry(state: ProjectStoreState, description: string): HistoryEntry {
  return {
    nodes: structuredClone(state.nodes),
    edges: structuredClone(state.edges),
    patches: structuredClone(state.patches),
    selectedNodeId: state.selectedNodeId,
    description,
  }
}

function serializedSize(value: unknown): number {
  const json = JSON.stringify(value, (_, item) => item instanceof Set ? [...item] : item)
  return new TextEncoder().encode(json).byteLength
}

function trimPast(entries: HistoryEntry[]): HistoryEntry[] {
  const removed: HistoryEntry[] = []
  let totalBytes = entries.reduce((total, entry) => total + serializedSize(entry), 0)
  while (
    entries.length > 1
    && (entries.length > MAX_UNDO_HISTORY || totalBytes > MAX_HISTORY_BYTES)
  ) {
    const entry = entries.shift()
    if (!entry) break
    removed.push(entry)
    totalBytes -= serializedSize(entry)
  }
  return removed
}

function updateFileRetention(
  past: HistoryEntry[],
  future: HistoryEntry[],
  transaction: HistoryEntry | undefined,
  discarded: HistoryEntry[] = [],
): void {
  const scope = getStorageScope()
  const retained = new Set<string>()
  for (const entry of [...past, ...future, ...(transaction ? [transaction] : [])]) {
    for (const ref of fileRefsInNodes(entry.nodes)) retained.add(ref)
  }
  retainHistoryFileRefs(scope, retained)
  const candidates = new Set<string>()
  for (const entry of discarded) {
    for (const ref of fileRefsInNodes(entry.nodes)) candidates.add(ref)
  }
  queueHistoryFileCleanup(scope, candidates)
}

/** Identity for merge restamping: ignore timestamps and view-only UI. */
function mergeSignature(node: ProjectNode | undefined): string {
  if (!node) return ''
  return JSON.stringify(Object.fromEntries(
    Object.entries(node).filter(([key]) => key !== 'updatedAt' && key !== 'ui'),
  ))
}

/** Data identity for cache invalidation: rename/position-only edits must not clear rows. */
function dataSignature(node: ProjectNode | undefined, patches: Patches | undefined): string {
  if (!isTableNode(node)) return ''
  return JSON.stringify({
    kind: node.kind,
    schema: node.schema,
    plan: node.plan,
    patches: computePatchesVersion(patches),
  })
}

function changedEdgeTargets(
  currentEdges: Record<string, Edge>,
  nextEdges: Record<string, Edge>,
  currentNodes: Record<string, ProjectNode>,
  nextNodes: Record<string, ProjectNode>,
): Set<string> {
  const targets = new Set<string>()
  const ids = new Set([...Object.keys(currentEdges), ...Object.keys(nextEdges)])
  for (const id of ids) {
    const current = currentEdges[id]
    const next = nextEdges[id]
    if (JSON.stringify(current) === JSON.stringify(next)) continue
    const targetId = next?.toNodeId ?? current?.toNodeId
    if (isTableNode(nextNodes[targetId]) || isTableNode(currentNodes[targetId])) {
      targets.add(targetId)
    }
  }
  return targets
}

interface Reconciliation {
  removed: string[]
  affected: string[]
  restamp: string[]
}

function reconciliationFor(
  current: ProjectStoreState,
  next: HistoryEntry,
): Reconciliation {
  const ids = new Set([...Object.keys(current.nodes), ...Object.keys(next.nodes)])
  const removed: string[] = []
  const dataChanged = changedEdgeTargets(current.edges, next.edges, current.nodes, next.nodes)
  const restamp = new Set<string>()

  for (const id of ids) {
    const before = current.nodes[id]
    const after = next.nodes[id]
    if (!isTableNode(before) && !isTableNode(after)) continue
    if (isTableNode(before) && !isTableNode(after)) removed.push(id)
    if (
      mergeSignature(before) !== mergeSignature(after)
      || computePatchesVersion(current.patches[id]) !== computePatchesVersion(next.patches[id])
    ) {
      if (isTableNode(after)) restamp.add(id)
    }
    if (dataSignature(before, current.patches[id]) !== dataSignature(after, next.patches[id])) {
      dataChanged.add(id)
    }
  }

  const affected = new Set<string>()
  for (const id of dataChanged) {
    if (!isTableNode(next.nodes[id])) continue
    affected.add(id)
    for (const dependent of getDependentNodeIds(next.nodes, next.edges, id)) {
      if (isTableNode(next.nodes[dependent])) affected.add(dependent)
    }
  }
  return { removed, affected: [...affected], restamp: [...restamp] }
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
    transaction: null,
  },

  saveSnapshot: (description) => {
    const active = get().history.transaction
    if (active) return active.id
    const id = `history-${++transactionSequence}`
    const current = get()
    const snapshot = cloneEntry(current, description)
    const past = [...current.history.past, snapshot]
    const removed = trimPast(past)
    const discarded = [...current.history.future]
    set((state) => {
      state.history.past = past
      state.history.future = []
    })
    updateFileRetention(past, [], undefined, [...discarded, ...removed])
    return id
  },

  undo: () => {
    const state = get()
    if (state.history.transaction || state.history.past.length === 0) return
    const previous = state.history.past[state.history.past.length - 1]
    const current = cloneEntry(state, previous.description)
    const past = state.history.past.slice(0, -1)
    const future = [...state.history.future, current]
    restore(previous, past, future, get, set)
  },

  redo: () => {
    const state = get()
    if (state.history.transaction || state.history.future.length === 0) return
    const next = state.history.future[state.history.future.length - 1]
    const current = cloneEntry(state, next.description)
    const past = [...state.history.past, current]
    const removed = trimPast(past)
    const future = state.history.future.slice(0, -1)
    restore(next, past, future, get, set, removed)
  },

  canUndo: () => !get().history.transaction && get().history.past.length > 0,
  canRedo: () => !get().history.transaction && get().history.future.length > 0,

  beginHistoryTransaction: (description) => {
    const state = get()
    if (state.history.transaction) return null
    const id = `transaction-${++transactionSequence}`
    const snapshot = cloneEntry(state, description)
    set((draft) => {
      draft.history.transaction = {
        id,
        projectId: state.projectId,
        snapshot,
      }
    })
    updateFileRetention(
      state.history.past,
      state.history.future,
      snapshot,
    )
    return id
  },

  commitHistoryTransaction: (id) => {
    const transaction = get().history.transaction
    // projectId guards against committing after a project switch reused the same id space.
    if (!transaction || transaction.id !== id || transaction.projectId !== get().projectId) {
      return false
    }
    const current = get()
    const past = [...current.history.past, transaction.snapshot]
    const removed = trimPast(past)
    const discarded = [...current.history.future]
    set((state) => {
      state.history.past = past
      state.history.future = []
      state.history.transaction = null
    })
    updateFileRetention(past, [], undefined, [...discarded, ...removed])
    return true
  },

  rollbackHistoryTransaction: (id) => {
    const state = get()
    const transaction = state.history.transaction
    if (!transaction || transaction.id !== id || transaction.projectId !== state.projectId) {
      return false
    }
    restore(transaction.snapshot, state.history.past, state.history.future, get, set)
    return true
  },
})

type HistorySet = Parameters<StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  HistorySliceState
>>[0]

function restore(
  targetEntry: HistoryEntry,
  past: HistoryEntry[],
  future: HistoryEntry[],
  get: () => ProjectStoreState,
  set: HistorySet,
  discarded: HistoryEntry[] = [],
): void {
  const current = get()
  const target = structuredClone(targetEntry)
  const reconciliation = reconciliationFor(current, target)
  // Restored snapshots carry old updatedAt values; restamp so cross-device merge
  // treats an explicit undo/redo as newer than the pre-restore document.
  const restamped = new Date().toISOString()
  for (const id of reconciliation.restamp) {
    const node = target.nodes[id]
    if (isTableNode(node)) node.updatedAt = restamped
  }

  set((state) => {
    state.nodes = target.nodes
    state.edges = target.edges
    state.patches = target.patches
    state.selectedNodeId = target.selectedNodeId && target.nodes[target.selectedNodeId]
      ? target.selectedNodeId
      : null
    state.history = { past, future, transaction: null }
  })
  updateFileRetention(past, future, undefined, discarded)

  if (reconciliation.removed.length || reconciliation.affected.length) {
    invalidateMaterializations()
  }
  const runtime = useTableRuntimeStore.getState()
  // deleteNode cancels gates; history restore bypasses deleteNode.
  for (const id of reconciliation.removed) {
    cancelTableOperation(id)
  }
  runtime.forgetNodes(reconciliation.removed)
  runtime.clearSchemas(reconciliation.affected)
  runtime.invalidateNodes(reconciliation.affected)
  for (const id of new Set([...reconciliation.removed, ...reconciliation.affected])) {
    useDataStore.getState().clearTableData(id)
  }
  if (reconciliation.removed.length && typeof Worker !== 'undefined') {
    void import('@/engine/engineTableCleanup')
      .then(({ dropEngineTables }) => dropEngineTables(reconciliation.removed, { onlyIfDeleted: true }))
      .catch(error => console.error('[history] Failed to drop removed engine tables:', error))
  }
}
