import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockFile } from './syncServiceTestSupport'

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  uploadFile: vi.fn(),
  getFileAsArrayBuffer: vi.fn(),
  deleteFile: vi.fn(),
  saveProjectLocal: vi.fn(),
  saveFileLocal: vi.fn(),
  loadFileLocal: vi.fn(),
  deleteFileLocal: vi.fn(),
}))

vi.mock('@/api/projects.api', () => ({
  createProject: (data: unknown) => mocks.createProject(data),
  updateProject: (id: string, data: unknown) => mocks.updateProject(id, data),
}))

vi.mock('@/api/files.api', () => ({
  uploadFile: (file: File, projectId?: string) => mocks.uploadFile(file, projectId),
  getFileAsArrayBuffer: (id: string) => mocks.getFileAsArrayBuffer(id),
  deleteFile: (id: string) => mocks.deleteFile(id),
}))

vi.mock('./db', () => ({
  saveProject: (...args: unknown[]) => mocks.saveProjectLocal(...args),
  saveFile: (...args: unknown[]) => mocks.saveFileLocal(...args),
  loadFile: (id: string) => mocks.loadFileLocal(id),
  deleteFile: (id: string) => mocks.deleteFileLocal(id),
}))

import {
  createProjectWithSync,
  deleteFileWithSync,
  isNetworkOnline,
  loadFileWithSync,
  saveProjectWithSync,
  uploadFileWithSync,
} from './syncService'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const {
  createProject: mockCreateProject,
  deleteFile: mockDeleteFile,
  deleteFileLocal: mockDeleteFileLocal,
  getFileAsArrayBuffer: mockGetFileAsArrayBuffer,
  loadFileLocal: mockLoadFileLocal,
  saveFileLocal: mockSaveFileLocal,
  saveProjectLocal: mockSaveProjectLocal,
  uploadFile: mockUploadFile,
} = mocks

describe('uploadFileWithSync', () => {
  it('uploads to server and caches locally when online', async () => {
    const file = createMockFile('test content', 'test.csv', 'text/csv')
    mockUploadFile.mockResolvedValue({
      id: 'server_file_123',
      filename: 'test.csv',
      contentType: 'text/csv',
    })
    const result = await uploadFileWithSync(file, 'proj_1')
    expect(mockUploadFile).toHaveBeenCalledWith(file, 'proj_1')
    expect(mockSaveFileLocal).toHaveBeenCalled()
    expect(result.id).toBe('server_file_123')
  })

  it('falls back to local when upload fails', async () => {
    mockUploadFile.mockRejectedValue(new Error('Upload failed'))
    const result = await uploadFileWithSync(
      createMockFile('test content', 'test.csv', 'text/csv'),
    )
    expect(mockSaveFileLocal).toHaveBeenCalled()
    expect(result.id).toMatch(/^local_file_/)
    expect(result.name).toBe('test.csv')
  })
})

describe('loadFileWithSync', () => {
  it('loads from local cache first', async () => {
    const buffer = new ArrayBuffer(10)
    mockLoadFileLocal.mockResolvedValue(buffer)
    const result = await loadFileWithSync('file_123')
    expect(mockLoadFileLocal).toHaveBeenCalledWith('file_123')
    expect(mockGetFileAsArrayBuffer).not.toHaveBeenCalled()
    expect(result).toBe(buffer)
  })

  it('fetches from backend if not in cache', async () => {
    mockLoadFileLocal.mockResolvedValue(null)
    const buffer = new ArrayBuffer(10)
    mockGetFileAsArrayBuffer.mockResolvedValue(buffer)
    const result = await loadFileWithSync('file_123')
    expect(mockLoadFileLocal).toHaveBeenCalled()
    expect(mockGetFileAsArrayBuffer).toHaveBeenCalledWith('file_123')
    expect(mockSaveFileLocal).toHaveBeenCalled()
    expect(result).toBe(buffer)
  })

  it('returns null for local files not in cache', async () => {
    mockLoadFileLocal.mockResolvedValue(null)
    expect(await loadFileWithSync('local_file_123')).toBeNull()
    expect(mockGetFileAsArrayBuffer).not.toHaveBeenCalled()
  })
})

describe('deleteFileWithSync', () => {
  it('deletes locally and from backend', async () => {
    await deleteFileWithSync('file_123')
    expect(mockDeleteFileLocal).toHaveBeenCalledWith('file_123')
    expect(mockDeleteFile).toHaveBeenCalledWith('file_123')
  })

  it('does not call backend for local-only files', async () => {
    await deleteFileWithSync('local_file_123')
    expect(mockDeleteFileLocal).toHaveBeenCalledWith('local_file_123')
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })
})

describe('sync status', () => {
  it('returns a boolean indicating online status', () => {
    expect(typeof isNetworkOnline()).toBe('boolean')
  })
})

describe('sync edge cases', () => {
  it('handles concurrent save operations gracefully', async () => {
    await Promise.all([
      saveProjectWithSync('proj_1', 'A', {}, {}, {}),
      saveProjectWithSync('proj_1', 'B', {}, {}, {}),
      saveProjectWithSync('proj_1', 'C', {}, {}, {}),
    ])
    expect(mockSaveProjectLocal).toHaveBeenCalledTimes(3)
  })

  it('handles special characters in project names', async () => {
    mockCreateProject.mockRejectedValue(new Error('Server unavailable'))
    const result = await createProjectWithSync('Test "Project" <with> & special chars')
    expect(result.name).toBe('Test "Project" <with> & special chars')
  })

  it('handles empty project state', async () => {
    await saveProjectWithSync('proj_empty', 'Empty', {}, {}, {})
    expect(mockSaveProjectLocal).toHaveBeenCalledWith('proj_empty', 'Empty', {}, {}, {})
  })
})
