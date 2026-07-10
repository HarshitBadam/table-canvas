import {
  deleteFile as deleteFileRemote,
  getFileAsArrayBuffer,
  uploadFile,
} from '@/api/files.api'
import {
  deleteFile as deleteFileLocal,
  loadFile as loadFileLocal,
  saveFile as saveFileLocal,
} from './db'
import { isNetworkOnline } from './syncState'

export interface FileWithSync {
  id: string
  name: string
  contentType: string
}

export async function loadFileWithSync(fileId: string): Promise<ArrayBuffer | null> {
  const localFile = await loadFileLocal(fileId)
  if (localFile) return localFile
  if (!isNetworkOnline() || fileId.startsWith('local_file_')) return null
  try {
    const buffer = await getFileAsArrayBuffer(fileId)
    await saveFileLocal(fileId, fileId, 'application/octet-stream', buffer)
    return buffer
  } catch (error) {
    console.error('[syncService] Failed to load file from backend:', error)
    return null
  }
}

export async function uploadFileWithSync(file: File, projectId?: string): Promise<FileWithSync> {
  if (isNetworkOnline()) {
    try {
      const uploaded = await uploadFile(file, projectId)
      await saveFileLocal(uploaded.id, uploaded.filename, uploaded.contentType, await file.arrayBuffer())
      return { id: uploaded.id, name: uploaded.filename, contentType: uploaded.contentType }
    } catch (error) {
      console.error('[syncService] Failed to upload file to backend:', error)
    }
  }
  const id = `local_file_${Date.now()}_${Math.random().toString(36).slice(2)}`
  await saveFileLocal(id, file.name, file.type, await file.arrayBuffer())
  return { id, name: file.name, contentType: file.type }
}

export async function deleteFileWithSync(fileId: string): Promise<void> {
  await deleteFileLocal(fileId)
  if (isNetworkOnline() && !fileId.startsWith('local_file_')) {
    try {
      await deleteFileRemote(fileId)
    } catch (error) {
      console.error('[syncService] Failed to delete file from backend:', error)
    }
  }
}
