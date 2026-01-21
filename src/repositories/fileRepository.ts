/**
 * File Repository
 * 
 * Abstracts file storage operations across local (IndexedDB) and remote (backend).
 * Provides a unified interface for file CRUD operations.
 */

import {
  uploadFileWithSync,
  loadFileWithSync,
  deleteFileWithSync,
} from '@/persistence/syncService'
import {
  saveFile as saveFileLocal,
  loadFile as loadFileLocal,
  deleteFile as deleteFileLocal,
} from '@/persistence/db'

// ============================================================================
// Types
// ============================================================================

export interface FileMetadata {
  id: string
  name: string
  type: string
  size?: number
  createdAt?: string
}

export interface FileUploadResult {
  id: string
  name: string
  type: string
}

// ============================================================================
// File Repository
// ============================================================================

export const fileRepository = {
  /**
   * Upload a file (handles sync to backend if online)
   */
  async upload(file: File, projectId?: string): Promise<FileUploadResult> {
    return uploadFileWithSync(file, projectId)
  },

  /**
   * Load a file by ID (checks local cache first, then backend)
   */
  async load(fileId: string): Promise<ArrayBuffer | null> {
    return loadFileWithSync(fileId)
  },

  /**
   * Delete a file by ID
   */
  async delete(fileId: string): Promise<void> {
    return deleteFileWithSync(fileId)
  },

  /**
   * Save file directly to local storage (for internal use)
   */
  async saveLocal(id: string, name: string, type: string, data: ArrayBuffer): Promise<void> {
    return saveFileLocal(id, name, type, data)
  },

  /**
   * Load file from local storage only
   */
  async loadLocal(id: string): Promise<ArrayBuffer | null> {
    return loadFileLocal(id)
  },

  /**
   * Delete file from local storage only
   */
  async deleteLocal(id: string): Promise<void> {
    return deleteFileLocal(id)
  },

  /**
   * Parse CSV from ArrayBuffer
   */
  async parseCSV(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
    const text = new TextDecoder().decode(buffer)
    // Use PapaParse in the actual implementation
    const lines = text.trim().split('\n')
    const headers = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, '')) || []
    const rows = lines.slice(1).map(line => 
      line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
    )
    return { headers, rows }
  },
}

// ============================================================================
// Export singleton
// ============================================================================

export default fileRepository
