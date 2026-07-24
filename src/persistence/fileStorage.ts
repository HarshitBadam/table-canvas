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
}

async function getFileRecord(
  db: Awaited<ReturnType<typeof getDB>>,
  id: string,
  scope: string,
) {
  return db.get('files', scopedStorageKey(scope, id))
}
