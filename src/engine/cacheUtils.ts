import { getEngine } from './EngineAdapter'

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

export function computeDerivedVersionHash(
  tableId: string,
  transformDefJson: string,
  upstreamHashes: string[]
): string {
  const upstreamHashStr = upstreamHashes.sort().join(':')
  return simpleHash(`derived:${tableId}:${transformDefJson}:${upstreamHashStr}`)
}

/**
 * Returns the engine row count for a table, or -1 if the table doesn't exist.
 * Used to detect a stale empty "shell" table (exists in DuckDB but holds 0 rows)
 * so we don't treat it as a valid cache hit and leave the grid blank.
 */
export async function getEngineTableRowCount(tableId: string): Promise<number> {
  try {
    const slice = await getEngine().getSlice(tableId, 0, 1)
    return slice.totalRows
  } catch {
    return -1
  }
}
