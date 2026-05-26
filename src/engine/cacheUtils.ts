import { getEngine } from './EngineAdapter'

/**
 * Fast, non-cryptographic hash for cache invalidation comparison.
 */
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
 * Check if a table exists in DuckDB.
 * DuckDB state is lost on page refresh, so we probe with a minimal query.
 */
export async function tableExistsInEngine(tableId: string): Promise<boolean> {
  try {
    const engine = getEngine()
    await engine.getSlice(tableId, 0, 1)
    return true
  } catch {
    return false
  }
}
