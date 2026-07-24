import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { createMockProject } from './syncServiceTestSupport'

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  saveProject: vi.fn(),
}))

vi.mock('@/api/projects.api', () => ({
  createProject: (data: unknown, operationId?: string) =>
    mocks.createProject(data, operationId),
  deleteProject: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn(),
  updateProject: vi.fn(),
}))
vi.mock('./db', () => ({
  deleteProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
  loadProject: vi.fn(),
  saveProject: (...args: unknown[]) => mocks.saveProject(...args),
}))

import { createProjectWithSync } from './projectSync'
import { accountStorageScope, setStorageScope } from './storageScope'

beforeEach(() => {
  vi.clearAllMocks()
  setStorageScope(accountStorageScope('test-user'))
  window.dispatchEvent(new Event('online'))
})

describe('createProjectWithSync reconciliation', () => {
  it('creates on the server with an operation ID and caches locally', async () => {
    mocks.createProject.mockResolvedValue(createMockProject('server_123', 'New Project'))

    const result = await createProjectWithSync('New Project')

    expect(mocks.createProject).toHaveBeenCalledWith(
      { name: 'New Project' },
      expect.stringMatching(/^project_/),
    )
    expect(mocks.saveProject).toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'server_123', isLocalOnly: false })
  })

  it('creates locally only when the client is known to be offline', async () => {
    window.dispatchEvent(new Event('offline'))

    const result = await createProjectWithSync('Offline Project')

    expect(mocks.createProject).not.toHaveBeenCalled()
    expect(mocks.saveProject).toHaveBeenCalled()
    expect(result).toMatchObject({
      name: 'Offline Project',
      isLocalOnly: true,
      needsSync: true,
    })
    expect(result.id).toMatch(/^local_/)
  })

  it.each([
    new TypeError('Network unavailable'),
    new ApiError('Server error', 503),
  ])('does not create a duplicate local project after an ambiguous failure', async (error) => {
    mocks.createProject.mockRejectedValue(error)

    await expect(createProjectWithSync('Ambiguous Project')).rejects.toMatchObject({
      name: 'AmbiguousProjectCreateError',
    })
    expect(mocks.createProject).toHaveBeenCalledTimes(2)
    expect(mocks.saveProject).not.toHaveBeenCalled()
  })

  it('uses the default name offline', async () => {
    window.dispatchEvent(new Event('offline'))
    expect((await createProjectWithSync()).name).toBe('Untitled Project')
  })

  it.each([401, 403])('propagates HTTP %s without local fallback', async (status) => {
    mocks.createProject.mockRejectedValue(
      new ApiError('Project creation rejected', status),
    )

    await expect(createProjectWithSync('Rejected')).rejects.toMatchObject({
      statusCode: status,
    })
    expect(mocks.saveProject).not.toHaveBeenCalled()
  })
})
