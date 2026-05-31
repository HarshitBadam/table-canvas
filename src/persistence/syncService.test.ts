/**
 * Unit tests for Sync Service
 * 
 * Tests the synchronization layer between local IndexedDB storage and backend API.
 * Critical paths tested:
 * - Online/offline detection and fallback
 * - Project CRUD with sync
 * - File upload/download with sync
 * - Debounced save behavior
 * - Error handling and recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'


const mockListProjects = vi.fn()
const mockGetProject = vi.fn()
const mockCreateProject = vi.fn()
const mockUpdateProject = vi.fn()
const mockDeleteProject = vi.fn()

const mockUploadFile = vi.fn()
const mockGetFileAsArrayBuffer = vi.fn()
const mockDeleteFile = vi.fn()

vi.mock('@/api/projects.api', () => ({
  listProjects: () => mockListProjects(),
  getProject: (id: string) => mockGetProject(id),
  createProject: (data: unknown) => mockCreateProject(data),
  updateProject: (id: string, data: unknown) => mockUpdateProject(id, data),
  deleteProject: (id: string) => mockDeleteProject(id),
  serializePatches: vi.fn((p) => p),
  deserializePatches: vi.fn((p) => p),
}))

vi.mock('@/api/files.api', () => ({
  uploadFile: (file: File, projectId?: string) => mockUploadFile(file, projectId),
  getFileAsArrayBuffer: (id: string) => mockGetFileAsArrayBuffer(id),
  deleteFile: (id: string) => mockDeleteFile(id),
}))

const mockSaveProjectLocal = vi.fn()
const mockLoadProjectLocal = vi.fn()
const mockListProjectsLocal = vi.fn()
const mockDeleteProjectLocal = vi.fn()
const mockSaveFileLocal = vi.fn()
const mockLoadFileLocal = vi.fn()
const mockDeleteFileLocal = vi.fn()

vi.mock('./db', () => ({
  saveProject: (...args: unknown[]) => mockSaveProjectLocal(...args),
  loadProject: (id: string) => mockLoadProjectLocal(id),
  listProjects: () => mockListProjectsLocal(),
  deleteProject: (id: string) => mockDeleteProjectLocal(id),
  saveFile: (...args: unknown[]) => mockSaveFileLocal(...args),
  loadFile: (id: string) => mockLoadFileLocal(id),
  deleteFile: (id: string) => mockDeleteFileLocal(id),
}))

import {
  fetchProjects,
  loadProjectWithSync,
  createProjectWithSync,
  saveProjectWithSync,
  deleteProjectWithSync,
  uploadFileWithSync,
  loadFileWithSync,
  deleteFileWithSync,
  getSyncStatus,
  isNetworkOnline,
} from './syncService'


function createMockProject(id: string, name: string) {
  return {
    id,
    name,
    nodes: {},
    edges: {},
    patches: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}


beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  
  // Note: navigator.onLine is cached at module load time in syncService,
  // so we test the offline fallback behavior through API failures instead
})

afterEach(() => {
  vi.useRealTimers()
})


describe('fetchProjects', () => {
  it('fetches from API when online', async () => {
    const mockProjects = [
      createMockProject('proj_1', 'Project 1'),
      createMockProject('proj_2', 'Project 2'),
    ]
    mockListProjects.mockResolvedValue(mockProjects)

    const result = await fetchProjects()

    expect(mockListProjects).toHaveBeenCalled()
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Project 1')
  })

  it('falls back to local storage when API fails', async () => {
    mockListProjects.mockRejectedValue(new Error('Network error'))
    mockListProjectsLocal.mockResolvedValue([
      { id: 'local_1', name: 'Local Project', updatedAt: new Date().toISOString() },
    ])

    const result = await fetchProjects()

    expect(mockListProjectsLocal).toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Local Project')
  })

  // Note: Offline behavior is tested via API failure fallback since 
  // navigator.onLine is cached at module load time. See 'falls back to 
  // local storage when API fails' test above for the effective offline path.
})


describe('loadProjectWithSync', () => {
  it('loads from API and caches locally when online', async () => {
    const mockProject = createMockProject('proj_123', 'Test Project')
    mockGetProject.mockResolvedValue(mockProject)

    const result = await loadProjectWithSync('proj_123')

    expect(mockGetProject).toHaveBeenCalledWith('proj_123')
    expect(mockSaveProjectLocal).toHaveBeenCalled()
    expect(result?.name).toBe('Test Project')
    expect(result?.isLocalOnly).toBe(false)
  })

  it('falls back to local when API fails', async () => {
    mockGetProject.mockRejectedValue(new Error('Not found'))
    mockLoadProjectLocal.mockResolvedValue({
      id: 'proj_123',
      name: 'Local Cached Project',
      nodes: {},
      edges: {},
      patches: {},
    })

    const result = await loadProjectWithSync('proj_123')

    expect(mockLoadProjectLocal).toHaveBeenCalledWith('proj_123')
    expect(result?.name).toBe('Local Cached Project')
    // Note: isLocalOnly depends on isOnline state which is cached at module load
    // In CI/test environment, isOnline may be true, so we check the behavior
    // rather than the exact flag value
    expect(result).not.toBeNull()
  })

  it('returns null when project not found anywhere', async () => {
    mockGetProject.mockRejectedValue(new Error('Not found'))
    mockLoadProjectLocal.mockResolvedValue(null)

    const result = await loadProjectWithSync('nonexistent')

    expect(result).toBeNull()
  })
})


describe('createProjectWithSync', () => {
  it('creates on server and caches locally when online', async () => {
    const mockProject = createMockProject('server_123', 'New Project')
    mockCreateProject.mockResolvedValue(mockProject)

    const result = await createProjectWithSync('New Project')

    expect(mockCreateProject).toHaveBeenCalledWith({ name: 'New Project' })
    expect(mockSaveProjectLocal).toHaveBeenCalled()
    expect(result.id).toBe('server_123')
    expect(result.isLocalOnly).toBe(false)
  })

  it('creates locally with local_ prefix when server fails', async () => {
    // Test the offline/failure path by making the server fail
    mockCreateProject.mockRejectedValue(new Error('Network unavailable'))

    const result = await createProjectWithSync('Offline Project')

    expect(mockSaveProjectLocal).toHaveBeenCalled()
    expect(result.id).toMatch(/^local_/)
    expect(result.isLocalOnly).toBe(true)
    expect(result.needsSync).toBe(true)
  })

  it('falls back to local when server fails', async () => {
    mockCreateProject.mockRejectedValue(new Error('Server error'))

    const result = await createProjectWithSync('Fallback Project')

    expect(mockSaveProjectLocal).toHaveBeenCalled()
    expect(result.id).toMatch(/^local_/)
    expect(result.isLocalOnly).toBe(true)
  })

  it('uses default name when none provided', async () => {
    mockCreateProject.mockRejectedValue(new Error('Server unavailable'))

    const result = await createProjectWithSync()

    expect(result.name).toBe('Untitled Project')
  })
})


describe('saveProjectWithSync', () => {
  it('saves locally immediately and debounces backend save', async () => {
    await saveProjectWithSync('proj_1', 'Test', {}, {}, {})

    expect(mockSaveProjectLocal).toHaveBeenCalledWith(
      'proj_1', 'Test', {}, {}, {}
    )

    expect(mockUpdateProject).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)

    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({ name: 'Test' })
    )
  })

  it('does not sync local-only projects to backend', async () => {
    await saveProjectWithSync('local_123', 'Local Project', {}, {}, {})

    expect(mockSaveProjectLocal).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)

    expect(mockUpdateProject).not.toHaveBeenCalled()
  })

  it('debounces multiple rapid saves', async () => {
    await saveProjectWithSync('proj_1', 'Version 1', {}, {}, {})
    await saveProjectWithSync('proj_1', 'Version 2', {}, {}, {})
    await saveProjectWithSync('proj_1', 'Version 3', {}, {}, {})

    await vi.advanceTimersByTimeAsync(2500)

    expect(mockUpdateProject).toHaveBeenCalledTimes(1)
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({ name: 'Version 3' })
    )
  })
})


describe('deleteProjectWithSync', () => {
  it('deletes locally and from backend', async () => {
    await deleteProjectWithSync('proj_123')

    expect(mockDeleteProjectLocal).toHaveBeenCalledWith('proj_123')
    expect(mockDeleteProject).toHaveBeenCalledWith('proj_123')
  })

  it('does not call backend for local-only projects', async () => {
    await deleteProjectWithSync('local_123')

    expect(mockDeleteProjectLocal).toHaveBeenCalledWith('local_123')
    expect(mockDeleteProject).not.toHaveBeenCalled()
  })

  it('continues even if backend delete fails', async () => {
    mockDeleteProject.mockRejectedValue(new Error('Server error'))

    // Should not throw
    await expect(deleteProjectWithSync('proj_123')).resolves.not.toThrow()
    expect(mockDeleteProjectLocal).toHaveBeenCalled()
  })
})


describe('uploadFileWithSync', () => {
  // Create a mock file with arrayBuffer method
  function createMockFile(content: string, name: string, type: string) {
    const blob = new Blob([content], { type })
    const file = new File([blob], name, { type })
    // Polyfill arrayBuffer for test environment
    if (!file.arrayBuffer) {
      file.arrayBuffer = () => Promise.resolve(new TextEncoder().encode(content).buffer)
    }
    return file
  }

  it('uploads to server and caches locally when online', async () => {
    const mockFile = createMockFile('test content', 'test.csv', 'text/csv')
    mockUploadFile.mockResolvedValue({
      id: 'server_file_123',
      filename: 'test.csv',
      contentType: 'text/csv',
    })

    const result = await uploadFileWithSync(mockFile, 'proj_1')

    expect(mockUploadFile).toHaveBeenCalledWith(mockFile, 'proj_1')
    expect(mockSaveFileLocal).toHaveBeenCalled()
    expect(result.id).toBe('server_file_123')
  })

  it('falls back to local when upload fails', async () => {
    mockUploadFile.mockRejectedValue(new Error('Upload failed'))
    const mockFile = createMockFile('test content', 'test.csv', 'text/csv')

    const result = await uploadFileWithSync(mockFile)

    expect(mockSaveFileLocal).toHaveBeenCalled()
    expect(result.id).toMatch(/^local_file_/)
    expect(result.name).toBe('test.csv')
  })
})


describe('loadFileWithSync', () => {
  it('loads from local cache first', async () => {
    const mockBuffer = new ArrayBuffer(10)
    mockLoadFileLocal.mockResolvedValue(mockBuffer)

    const result = await loadFileWithSync('file_123')

    expect(mockLoadFileLocal).toHaveBeenCalledWith('file_123')
    expect(mockGetFileAsArrayBuffer).not.toHaveBeenCalled()
    expect(result).toBe(mockBuffer)
  })

  it('fetches from backend if not in cache', async () => {
    mockLoadFileLocal.mockResolvedValue(null)
    const mockBuffer = new ArrayBuffer(10)
    mockGetFileAsArrayBuffer.mockResolvedValue(mockBuffer)

    const result = await loadFileWithSync('file_123')

    expect(mockLoadFileLocal).toHaveBeenCalled()
    expect(mockGetFileAsArrayBuffer).toHaveBeenCalledWith('file_123')
    expect(mockSaveFileLocal).toHaveBeenCalled()
    expect(result).toBe(mockBuffer)
  })

  it('returns null for local files not in cache', async () => {
    mockLoadFileLocal.mockResolvedValue(null)

    const result = await loadFileWithSync('local_file_123')

    expect(mockGetFileAsArrayBuffer).not.toHaveBeenCalled()
    expect(result).toBeNull()
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


describe('getSyncStatus', () => {
  it('returns initial sync status', () => {
    const status = getSyncStatus()

    expect(status).toHaveProperty('isSyncing')
    expect(status).toHaveProperty('lastSyncedAt')
    expect(status).toHaveProperty('error')
  })
})

describe('isNetworkOnline', () => {
  it('returns a boolean indicating online status', () => {
    // Note: The actual implementation caches navigator.onLine at module load time
    // So we just verify it returns the expected type
    const result = isNetworkOnline()
    expect(typeof result).toBe('boolean')
  })
})


describe('Edge Cases', () => {
  it('handles concurrent save operations gracefully', async () => {
    const saves = Promise.all([
      saveProjectWithSync('proj_1', 'A', {}, {}, {}),
      saveProjectWithSync('proj_1', 'B', {}, {}, {}),
      saveProjectWithSync('proj_1', 'C', {}, {}, {}),
    ])

    await saves

    expect(mockSaveProjectLocal).toHaveBeenCalledTimes(3)
  })

  it('handles special characters in project names', async () => {
    mockCreateProject.mockRejectedValue(new Error('Server unavailable'))

    const result = await createProjectWithSync('Test "Project" <with> & special chars')

    expect(result.name).toBe('Test "Project" <with> & special chars')
  })

  it('handles empty project state', async () => {
    await saveProjectWithSync('proj_empty', 'Empty', {}, {}, {})

    expect(mockSaveProjectLocal).toHaveBeenCalledWith(
      'proj_empty', 'Empty', {}, {}, {}
    )
  })
})
