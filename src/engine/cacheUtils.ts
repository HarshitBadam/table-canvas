import { getEngine } from './EngineAdapter'
import type { Patches } from '@/types'

export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

export function computeSourceVersionHash(
  tableId: string,
  fileRef: string,
  patchVersion: string
): string {
  return simpleHash(`source:${tableId}:${fileRef}:${patchVersion}`)
}

export function computePatchesVersion(patches: Patches | undefined): string {
  if (!patches) return 'none'

  const cellPatches = Object.keys(patches.cellPatches)
    .sort()
    .map((columnId) => [
      columnId,
      Object.keys(patches.cellPatches[columnId])
        .sort()
        .map((rowId) => [rowId, patches.cellPatches[columnId][rowId]]),
    ])
  const insertedRows = patches.insertedRows.map((row) => ({
    rowId: row.rowId,
    insertedAt: row.insertedAt,
    values: Object.fromEntries(Object.entries(row.values).sort(([a], [b]) => a.localeCompare(b))),
  }))
  const deletedRows = [...patches.deletedRows].sort()

  return simpleHash(JSON.stringify({ cellPatches, insertedRows, deletedRows }))
}

export function computeDerivedVersionHash(
  tableId: string,
  transformDefJson: string,
  upstreamHashes: string[]
): string {
  const upstreamHashStr = upstreamHashes.sort().join(':')
  return simpleHash(`derived:${tableId}:${transformDefJson}:${upstreamHashStr}`)
}

export async function getEngineTableRowCount(tableId: string): Promise<number> {
  try {
    const slice = await getEngine().getSlice(tableId, 0, 1)
    return slice.totalRows
  } catch {
    return -1
  }
}
