import { getDB } from './dbCore'

export async function saveFile(id: string, name: string, type: string, data: ArrayBuffer): Promise<void> {
  const db = await getDB()

  await db.put('files', {
    id,
    name,
    type,
    data,
    createdAt: new Date().toISOString(),
  })
}

export async function loadFile(id: string): Promise<ArrayBuffer | null> {
  const db = await getDB()
  const file = await db.get('files', id)
  return file?.data ?? null
}

export async function loadFileRecord(id: string): Promise<{
  id: string
  name: string
  type: string
  data: ArrayBuffer
  createdAt: string
} | null> {
  const db = await getDB()
  const file = await db.get('files', id)
  return file ?? null
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('files', id)
}
