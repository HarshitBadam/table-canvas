import {
  deleteFile as deleteFileRemote,
  getFileAsArrayBuffer,
  uploadFile,
} from '@/api/files.api'
import {
  deleteFile as deleteFileLocal,
  loadFile as loadFileLocal,
  saveFile as saveFileLocal,
} from './fileStorage'
import { isNetworkOnline } from './syncState'

export interface FileWithSync {
  id: string
  name: string
  contentType: string
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'))
    reader.readAsArrayBuffer(file)
  })
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
  const buffer = await readFileBuffer(file)
  if (isNetworkOnline()) {
    try {
      const uploaded = await uploadFile(file, projectId)
      await saveFileLocal(uploaded.id, uploaded.filename, uploaded.contentType, buffer)
      return { id: uploaded.id, name: uploaded.filename, contentType: uploaded.contentType }
    } catch (error) {
      console.error('[syncService] Failed to upload file to backend:', error)
    }
  }
  const id = `local_file_${Date.now()}_${Math.random().toString(36).slice(2)}`
  await saveFileLocal(id, file.name, file.type, buffer)
  return { id, name: file.name, contentType: file.type }
}

export async function deleteFileWithSync(
  fileId: string,
  options?: { strictRemote?: boolean },
): Promise<void> {
  if (options?.strictRemote && isNetworkOnline() && !fileId.startsWith('local_file_')) {
    await deleteFileRemote(fileId)
    await deleteFileLocal(fileId)
    return
  }
  await deleteFileLocal(fileId)
  if (isNetworkOnline() && !fileId.startsWith('local_file_')) {
    try {
      await deleteFileRemote(fileId)
    } catch (error) {
      console.error('[syncService] Failed to delete file from backend:', error)
    }
  }
}
