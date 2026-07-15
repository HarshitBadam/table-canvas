import { getEngine } from './EngineAdapter'
import type { Patches, TableSchema } from '@/types'

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
  patchVersion: string,
  schemaFingerprint: string,
): string {
  return simpleHash(`source:${tableId}:${fileRef}:${patchVersion}:${schemaFingerprint}`)
}

export function computeSchemaFingerprint(schema: TableSchema | undefined): string {
  if (!schema) return 'none'

  return simpleHash(JSON.stringify({
    columns: schema.columns.map((column) => ({
      id: column.id,
      name: column.name,
      sourceName: column.sourceName ?? null,
      duckDbName: column.duckDbName ?? null,
      type: column.type,
      nullable: column.nullable,
      formula: column.formula ?? null,
      canonicalFormula: column.canonicalFormula ?? null,
      isComputed: column.isComputed ?? false,
    })),
  }))
}

export function copySchema(schema: TableSchema | undefined): TableSchema | undefined {
  return schema
    ? { ...schema, columns: schema.columns.map((column) => ({ ...column })) }
    : undefined
}

export function copyPatches(patches: Patches | undefined): Patches | undefined {
  if (!patches) return undefined
  return {
    ...patches,
    cellPatches: Object.fromEntries(
      Object.entries(patches.cellPatches).map(([columnId, values]) => [
        columnId,
        { ...values },
      ]),
    ),
    insertedRows: patches.insertedRows.map((row) => ({
      ...row,
      values: { ...row.values },
    })),
    deletedRows: new Set(patches.deletedRows),
    highlightedCells: patches.highlightedCells
      ? new Set(patches.highlightedCells)
      : undefined,
  }
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
