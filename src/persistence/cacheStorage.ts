import { getDB } from './dbCore'

export async function saveCache(
  tableId: string,
  type: 'profile' | 'slice' | 'aggregation',
  data: unknown
): Promise<void> {
  const db = await getDB()

  await db.put('cache', {
    tableId,
    type,
    data,
    computedAt: new Date().toISOString(),
  })
}

export async function loadCache(
  tableId: string,
  type: 'profile' | 'slice' | 'aggregation'
): Promise<unknown | null> {
  const db = await getDB()
  const cached = await db.get('cache', [tableId, type])
  return cached?.data ?? null
}

export async function clearTableCache(tableId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('cache', 'readwrite')
  const index = tx.store.index('by-table')

  const keysToDelete = await index.getAllKeys(tableId)
  for (const key of keysToDelete) {
    await tx.store.delete(key)
  }

  await tx.done
}
