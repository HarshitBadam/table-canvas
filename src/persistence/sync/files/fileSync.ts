import {
  deleteFile as deleteFileRemote,
  getFileAsArrayBuffer,
  listFiles,
  uploadFile,
} from '@/api/files.api'
import {
  deleteFile as deleteFileLocal,
  loadFile as loadFileLocal,
  saveFile as saveFileLocal,
} from '../../storage/local-db/fileStorage'
import { isNetworkOnline } from '../session/syncState'
import {
  captureStorageScopeContext,
  isGuestStorageScope,
  isStorageScopeContextCurrent,
  type StorageScopeContext,
} from '../../storage/storageScope'
import { isRetryableRemoteDeferral } from '../project/projectCreateReconciliation'

export interface FileWithSync {
  id: string
  name: string
  contentType: string
}

export interface UploadFileSyncOptions {
  requireRemoteWhenOnline?: boolean
  /**
   * Import retries need this: the project save can be lost after a successful upload,
   * so an identical cloud file must be reusable without consuming quota again.
   */
  deduplicate?: boolean
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

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

async function findIdenticalRemoteFile(
  file: File,
  buffer: ArrayBuffer,
  context: StorageScopeContext,
): Promise<FileWithSync | null> {
  try {
    const candidates = (await listFiles()).filter(candidate => (
      candidate.filename === file.name && candidate.size === file.size
    ))
    if (!isStorageScopeContextCurrent(context)) return null
    for (const candidate of candidates) {
      const existing = await loadFileLocal(candidate.id, context.scope)
        ?? await getFileAsArrayBuffer(candidate.id)
      if (!isStorageScopeContextCurrent(context)) return null
      if (!buffersEqual(existing, buffer)) continue
      await saveFileLocal(
        candidate.id,
        candidate.filename,
        candidate.contentType,
        buffer,
        context.scope,
      )
      return {
        id: candidate.id,
        name: candidate.filename,
        contentType: candidate.contentType,
      }
    }
  } catch (error) {
    // Deduplication is an optimization and recovery path. A lookup failure must not
    // prevent the normal upload from reporting its own authoritative result.
    console.warn('[syncService] Could not check for an existing identical file:', error)
  }
  return null
}

export async function loadFileWithSync(fileId: string): Promise<ArrayBuffer | null> {
  const context = captureStorageScopeContext()
  const localFile = await loadFileLocal(fileId, context.scope)
  if (!isStorageScopeContextCurrent(context)) return null
  if (localFile) return localFile
  if (
    !isNetworkOnline()
    || isGuestStorageScope(context.scope)
    || fileId.startsWith('local_file_')
  ) return null
  try {
    const buffer = await getFileAsArrayBuffer(fileId)
    if (!isStorageScopeContextCurrent(context)) return null
    await saveFileLocal(
      fileId,
      fileId,
      'application/octet-stream',
      buffer,
      context.scope,
    )
    if (!isStorageScopeContextCurrent(context)) return null
    return buffer
  } catch (error) {
    console.error('[syncService] Failed to load file from backend:', error)
    return null
  }
}

export async function uploadFileWithSync(
  file: File,
  projectId?: string,
  operationId = createUploadOperationId(),
  options?: UploadFileSyncOptions,
): Promise<FileWithSync> {
  const context = captureStorageScopeContext()
  const buffer = await readFileBuffer(file)
  assertStorageContext(context)
  const remoteAvailable = isNetworkOnline() && !isGuestStorageScope(context.scope)
  if (remoteAvailable) {
    if (options?.deduplicate) {
      const existing = await findIdenticalRemoteFile(file, buffer, context)
      assertStorageContext(context)
      if (existing) return existing
    }
    let uploaded: Awaited<ReturnType<typeof uploadFile>> | null = null
    let uploadError: unknown
    try {
      uploaded = await uploadFile(file, projectId, operationId)
    } catch (firstError) {
      uploadError = firstError
      assertStorageContext(context)
      if (isRetryableRemoteDeferral(firstError)) {
        try {
          uploaded = await uploadFile(file, projectId, operationId)
        } catch (retryError) {
          uploadError = retryError
          console.error('[syncService] Failed to upload file to backend:', retryError)
        }
      } else {
        console.error('[syncService] Failed to upload file to backend:', firstError)
      }
    }
    assertStorageContext(context)
    if (uploaded) {
      try {
        await saveFileLocal(
          uploaded.id,
          uploaded.filename,
          uploaded.contentType,
          buffer,
          context.scope,
        )
      } catch (error) {
        console.error('[syncService] Uploaded file but could not cache it locally:', error)
      }
      assertStorageContext(context)
      return { id: uploaded.id, name: uploaded.filename, contentType: uploaded.contentType }
    }
    if (options?.requireRemoteWhenOnline) {
      throw uploadError instanceof Error
        ? uploadError
        : new Error('The file could not be saved to cloud storage.')
    }
  }
  assertStorageContext(context)
  const id = `local_file_${Date.now()}_${Math.random().toString(36).slice(2)}`
  await saveFileLocal(id, file.name, file.type, buffer, context.scope)
  assertStorageContext(context)
  return { id, name: file.name, contentType: file.type }
}

function createUploadOperationId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `file_${suffix}`
}

export async function deleteFileWithSync(
  fileId: string,
  options?: { strictRemote?: boolean },
  context = captureStorageScopeContext(),
): Promise<void> {
  if (!isStorageScopeContextCurrent(context)) return
  if (
    options?.strictRemote
    && isNetworkOnline()
    && !isGuestStorageScope(context.scope)
    && !fileId.startsWith('local_file_')
  ) {
    await deleteFileRemote(fileId)
    if (!isStorageScopeContextCurrent(context)) return
    await deleteFileLocal(fileId, context.scope)
    return
  }
  await deleteFileLocal(fileId, context.scope)
  if (!isStorageScopeContextCurrent(context)) return
  if (
    isNetworkOnline()
    && !isGuestStorageScope(context.scope)
    && !fileId.startsWith('local_file_')
  ) {
    try {
      await deleteFileRemote(fileId)
    } catch (error) {
      console.error('[syncService] Failed to delete file from backend:', error)
    }
  }
}

function assertStorageContext(context: StorageScopeContext): void {
  if (!isStorageScopeContextCurrent(context)) {
    throw new Error('The account changed while the file operation was in progress.')
  }
}
