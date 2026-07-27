import type { SerializedPatches } from './patchSerialization'
import { compareStrings, isDeepEqual, unionKeys } from './projectMergeNodes'

type InsertedRow = SerializedPatches['insertedRows'][number]

const ABSENT = Symbol('absent-cell')
type CellState = unknown | typeof ABSENT

export interface PatchMergeContext {
  nodeIds: Set<string>
  localWinningNodeIds: Set<string>
}

function cellsOf(patches: SerializedPatches | undefined): Record<string, Record<string, unknown>> {
  return patches?.cellPatches ?? {}
}

function cellAt(
  patches: SerializedPatches | undefined,
  rowId: string,
  columnId: string,
): CellState {
  const row = cellsOf(patches)[rowId]
  if (!row || !(columnId in row)) return ABSENT
  return row[columnId]
}

function isSameCell(left: CellState, right: CellState): boolean {
  if (left === ABSENT || right === ABSENT) return left === right
  return isDeepEqual(left, right)
}

function resolveCell(
  base: CellState,
  local: CellState,
  server: CellState,
  localWins: boolean,
): CellState {
  if (isSameCell(local, base)) return server
  if (isSameCell(server, base)) return local
  if (local === ABSENT) return server
  if (server === ABSENT) return local
  return localWins ? local : server
}

function mergeCellPatches(
  base: SerializedPatches | undefined,
  local: SerializedPatches | undefined,
  server: SerializedPatches | undefined,
  localWins: boolean,
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = {}
  for (const rowId of unionKeys(cellsOf(base), cellsOf(local), cellsOf(server))) {
    const row: Record<string, unknown> = {}
    const columnIds = unionKeys(
      cellsOf(base)[rowId] ?? {},
      cellsOf(local)[rowId] ?? {},
      cellsOf(server)[rowId] ?? {},
    )
    for (const columnId of columnIds) {
      const resolved = resolveCell(
        cellAt(base, rowId, columnId),
        cellAt(local, rowId, columnId),
        cellAt(server, rowId, columnId),
        localWins,
      )
      if (resolved !== ABSENT) row[columnId] = resolved
    }
    if (Object.keys(row).length > 0) merged[rowId] = row
  }
  return merged
}

function mergeStringSet(base: string[], local: string[], server: string[]): string[] {
  const baseSet = new Set(base)
  const localSet = new Set(local)
  const serverSet = new Set(server)
  const kept = new Set<string>()
  for (const value of [...localSet, ...serverSet]) {
    const retainedByBoth = localSet.has(value) && serverSet.has(value)
    if (retainedByBoth || !baseSet.has(value)) kept.add(value)
  }
  return [...kept].sort(compareStrings)
}

function mergeInsertedRows(
  local: InsertedRow[],
  server: InsertedRow[],
  localWins: boolean,
): InsertedRow[] {
  const byRowId = new Map<string, InsertedRow>()
  const ordered = localWins ? [...server, ...local] : [...local, ...server]
  for (const row of ordered) byRowId.set(row.rowId, row)
  return [...byRowId.values()].sort((left, right) => (
    left.insertedAt - right.insertedAt || compareStrings(left.rowId, right.rowId)
  ))
}

export function mergePatchMaps(
  base: Record<string, SerializedPatches>,
  local: Record<string, SerializedPatches>,
  server: Record<string, SerializedPatches>,
  context: PatchMergeContext,
): Record<string, SerializedPatches> {
  const merged: Record<string, SerializedPatches> = {}
  for (const nodeId of unionKeys(base, local, server)) {
    const localPatches = local[nodeId]
    const serverPatches = server[nodeId]
    if (!context.nodeIds.has(nodeId) || (!localPatches && !serverPatches)) continue
    const basePatches = base[nodeId]
    const localWins = context.localWinningNodeIds.has(nodeId)
    merged[nodeId] = {
      cellPatches: mergeCellPatches(basePatches, localPatches, serverPatches, localWins),
      deletedRows: mergeStringSet(
        basePatches?.deletedRows ?? [],
        localPatches?.deletedRows ?? [],
        serverPatches?.deletedRows ?? [],
      ),
      insertedRows: mergeInsertedRows(
        localPatches?.insertedRows ?? [],
        serverPatches?.insertedRows ?? [],
        localWins,
      ),
      highlightedCells: mergeStringSet(
        basePatches?.highlightedCells ?? [],
        localPatches?.highlightedCells ?? [],
        serverPatches?.highlightedCells ?? [],
      ),
    }
  }
  return merged
}
