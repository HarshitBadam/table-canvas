import type { CellValue, InsertedRow, Patches } from '@/types'

export interface SerializedPatches {
  cellPatches: Record<string, Record<string, unknown>>
  deletedRows: string[]
  insertedRows: Array<{ rowId: string; values: Record<string, unknown>; insertedAt: number }>
  highlightedCells: string[]
}

export function serializePatches(patches: Record<string, Patches>): Record<string, SerializedPatches> {
  return Object.fromEntries(Object.entries(patches).map(([tableId, patch]) => [
    tableId,
    {
      cellPatches: patch.cellPatches,
      deletedRows: [...patch.deletedRows],
      insertedRows: patch.insertedRows,
      highlightedCells: [...(patch.highlightedCells ?? [])],
    },
  ]))
}

export function deserializePatches(
  serialized: Record<string, SerializedPatches>
): Record<string, Patches> {
  return Object.fromEntries(Object.entries(serialized).map(([tableId, patch]) => [
    tableId,
    {
      cellPatches: patch.cellPatches as Record<string, Record<string, CellValue>>,
      deletedRows: new Set(patch.deletedRows),
      insertedRows: patch.insertedRows as InsertedRow[],
      highlightedCells: new Set(patch.highlightedCells ?? []),
    },
  ]))
}
