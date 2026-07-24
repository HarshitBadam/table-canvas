import { getDB } from './dbCore'
import { getStorageScope, scopedStorageKey } from './storageScope'

export async function saveFile(
  id: string,
  name: string,
  type: string,
  data: ArrayBuffer,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()

  await db.put('files', {
    id: scopedStorageKey(scope, id),
    entityId: id,
    ownerId: scope,
    name,
    type,
    data,
    createdAt: new Date().toISOString(),
  })
  if (scope === 'guest') {
    await db.delete('files', id)
  }
}

export async function loadFile(
  id: string,
  scope = getStorageScope(),
): Promise<ArrayBuffer | null> {
  const db = await getDB()
  const file = await getFileRecord(db, id, scope)
  return file?.data ?? null
}

export async function loadFileRecord(
  id: string,
  scope = getStorageScope(),
): Promise<{
  id: string
  name: string
  type: string
  data: ArrayBuffer
  createdAt: string
} | null> {
  const db = await getDB()
  const file = await getFileRecord(db, id, scope)
  if (!file) return null
  return { ...file, id: file.entityId ?? file.id }
}

export async function deleteFile(
  id: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.delete('files', scopedStorageKey(scope, id))
  if (scope === 'guest') {
    await db.delete('files', id)
  }
}

async function getFileRecord(
  db: Awaited<ReturnType<typeof getDB>>,
  id: string,
  scope: string,
) {
  const scoped = await db.get('files', scopedStorageKey(scope, id))
  if (scoped || scope !== 'guest') return scoped
  return db.get('files', id)
}
