import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProject } from './syncServiceTestSupport'

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  saveProjectLocal: vi.fn(),
  loadProjectLocal: vi.fn(),
  listProjectsLocal: vi.fn(),
  deleteProjectLocal: vi.fn(),
}))

vi.mock('@/api/projects.api', () => ({
  listProjects: () => mocks.listProjects(),
  getProject: (id: string) => mocks.getProject(id),
  createProject: (data: unknown) => mocks.createProject(data),
  updateProject: (id: string, data: unknown) => mocks.updateProject(id, data),
  deleteProject: (id: string) => mocks.deleteProject(id),
}))

vi.mock('./db', () => ({
  saveProject: (...args: unknown[]) => mocks.saveProjectLocal(...args),
  loadProject: (id: string) => mocks.loadProjectLocal(id),
  listProjects: () => mocks.listProjectsLocal(),
  deleteProject: (id: string) => mocks.deleteProjectLocal(id),
}))

import {
  createProjectWithSync,
  deleteProjectWithSync,
  fetchProjects,
  loadProjectWithSync,
  saveProjectWithSync,
  syncLocalProjectsToBackend,
} from './syncService'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.listProjectsLocal.mockResolvedValue([])
  mocks.loadProjectLocal.mockResolvedValue(null)
  mocks.updateProject.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

const {
  createProject: mockCreateProject,
  deleteProject: mockDeleteProject,
  deleteProjectLocal: mockDeleteProjectLocal,
  getProject: mockGetProject,
  listProjects: mockListProjects,
  listProjectsLocal: mockListProjectsLocal,
  loadProjectLocal: mockLoadProjectLocal,
  saveProjectLocal: mockSaveProjectLocal,
  updateProject: mockUpdateProject,
} = mocks

describe('fetchProjects', () => {
  it('fetches from API when online', async () => {
    mockListProjects.mockResolvedValue([
      createMockProject('proj_1', 'Project 1'),
      createMockProject('proj_2', 'Project 2'),
    ])
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

  it('keeps newer cached metadata and includes unsynced local projects', async () => {
    const remote = createMockProject('proj_1', 'Remote name')
    remote.updatedAt = new Date('2026-01-01T00:00:00.000Z')
    mockListProjects.mockResolvedValue([remote])
    mockListProjectsLocal.mockResolvedValue([
      {
        id: 'proj_1',
        name: 'Newer local name',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'local_1',
        name: 'Offline project',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ])

    const result = await fetchProjects()

    expect(result.map(project => project.id)).toEqual(['local_1', 'proj_1'])
    expect(result[1].name).toBe('Newer local name')
  })
})

describe('loadProjectWithSync', () => {
  it('loads from API and caches locally when online', async () => {
    mockGetProject.mockResolvedValue(createMockProject('proj_123', 'Test Project'))
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
    expect(result).not.toBeNull()
  })

  it('returns null when project not found anywhere', async () => {
    mockGetProject.mockRejectedValue(new Error('Not found'))
    mockLoadProjectLocal.mockResolvedValue(null)
    expect(await loadProjectWithSync('nonexistent')).toBeNull()
  })

  it('preserves and uploads a newer local project instead of overwriting it', async () => {
    const remote = createMockProject('proj_123', 'Stale remote project')
    remote.updatedAt = new Date('2026-01-01T00:00:00.000Z')
    mockGetProject.mockResolvedValue(remote)
    mockLoadProjectLocal.mockResolvedValue({
      id: 'proj_123',
      name: 'Newer local project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    const result = await loadProjectWithSync('proj_123')

    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_123',
      expect.objectContaining({ name: 'Newer local project' }),
    )
    expect(result?.name).toBe('Newer local project')
    expect(result?.needsSync).toBe(false)
    expect(mockSaveProjectLocal).not.toHaveBeenCalled()
  })

  it('loads local-only projects without making a doomed backend request', async () => {
    mockLoadProjectLocal.mockResolvedValue({
      id: 'local_123',
      name: 'Offline project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    const result = await loadProjectWithSync('local_123')

    expect(mockGetProject).not.toHaveBeenCalled()
    expect(result?.isLocalOnly).toBe(true)
    expect(result?.needsSync).toBe(true)
  })
})

describe('createProjectWithSync', () => {
  it('creates on server and caches locally when online', async () => {
    mockCreateProject.mockResolvedValue(createMockProject('server_123', 'New Project'))
    const result = await createProjectWithSync('New Project')
    expect(mockCreateProject).toHaveBeenCalledWith({ name: 'New Project' })
    expect(mockSaveProjectLocal).toHaveBeenCalled()
    expect(result.id).toBe('server_123')
    expect(result.isLocalOnly).toBe(false)
  })

  it('creates locally with local_ prefix when server fails', async () => {
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
    expect((await createProjectWithSync()).name).toBe('Untitled Project')
  })
})

describe('saveProjectWithSync', () => {
  it('saves locally immediately and debounces backend save', async () => {
    await saveProjectWithSync('proj_1', 'Test', {}, {}, {})
    expect(mockSaveProjectLocal).toHaveBeenCalledWith('proj_1', 'Test', {}, {}, {})
    expect(mockUpdateProject).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({ name: 'Test' }),
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
      expect.objectContaining({ name: 'Version 3' }),
    )
  })
})

describe('syncLocalProjectsToBackend', () => {
  it('promotes an offline project when sync is triggered after login', async () => {
    mockListProjectsLocal.mockResolvedValue([
      { id: 'local_123', name: 'Offline project', updatedAt: '2026-01-01T00:00:00.000Z' },
    ])
    mockLoadProjectLocal.mockResolvedValue({
      id: 'local_123',
      name: 'Offline project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    mockCreateProject.mockResolvedValue(createMockProject('server_123', 'Offline project'))

    await syncLocalProjectsToBackend()

    expect(mockCreateProject).toHaveBeenCalledWith({ name: 'Offline project' })
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'server_123',
      expect.objectContaining({ name: 'Offline project' }),
    )
    expect(mockDeleteProjectLocal).toHaveBeenCalledWith('local_123')
    expect(mockSaveProjectLocal).toHaveBeenCalledWith(
      'server_123',
      'Offline project',
      {},
      {},
      {},
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
    await expect(deleteProjectWithSync('proj_123')).resolves.not.toThrow()
    expect(mockDeleteProjectLocal).toHaveBeenCalled()
  })
})
