import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { createMockProject } from '@/persistence/sync/session/syncServiceTestSupport'

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
vi.mock('@/persistence/storage/local-db/db', () => ({
  deleteProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
  loadProject: vi.fn(),
  saveProject: (...args: unknown[]) => mocks.saveProject(...args),
}))

import { createProjectWithSync } from '@/persistence/sync/project/projectSync'
import { accountStorageScope, setStorageScope } from '@/persistence/storage/storageScope'

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

  it('uses a distinct idempotency key for separate same-name create intents', async () => {
    mocks.createProject
      .mockResolvedValueOnce(createMockProject('server_1', 'Same name'))
      .mockResolvedValueOnce(createMockProject('server_2', 'Same name'))

    await createProjectWithSync('Same name')
    await createProjectWithSync('Same name')

    const firstKey = mocks.createProject.mock.calls[0][1]
    const secondKey = mocks.createProject.mock.calls[1][1]
    expect(firstKey).toMatch(/^project_/)
    expect(secondKey).toMatch(/^project_/)
    expect(secondKey).not.toBe(firstKey)
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
    expect(new Set(mocks.createProject.mock.calls.map(call => call[1])).size).toBe(1)
    expect(mocks.saveProject).not.toHaveBeenCalled()
  })

  it('gives concurrent same-name create intents distinct operation ids', async () => {
    let resolveFirst!: (project: ReturnType<typeof createMockProject>) => void
    mocks.createProject
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce(createMockProject('server_concurrent_2', 'Concurrent name'))

    const first = createProjectWithSync('Concurrent name')
    await vi.waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(1))
    const second = createProjectWithSync('Concurrent name')
    await vi.waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(2))
    resolveFirst(createMockProject('server_concurrent_1', 'Concurrent name'))
    await Promise.all([first, second])

    const firstKey = mocks.createProject.mock.calls[0][1]
    const secondKey = mocks.createProject.mock.calls[1][1]
    expect(firstKey).not.toBe(secondKey)
  })

  it('reuses the same operation id when retrying after an ambiguous create', async () => {
    mocks.createProject.mockRejectedValue(new TypeError('Network unavailable'))

    await expect(createProjectWithSync('Retry name')).rejects.toMatchObject({
      name: 'AmbiguousProjectCreateError',
    })
    const ambiguousKey = mocks.createProject.mock.calls[0][1]
    expect(mocks.createProject).toHaveBeenCalledTimes(2)

    mocks.createProject.mockReset()
    mocks.createProject.mockResolvedValue(createMockProject('server_retry', 'Retry name'))

    const result = await createProjectWithSync('Retry name')

    expect(mocks.createProject).toHaveBeenCalledWith({ name: 'Retry name' }, ambiguousKey)
    expect(result).toMatchObject({ id: 'server_retry' })
  })

  it('does not reuse an operation id from a different name or scope', async () => {
    mocks.createProject.mockRejectedValue(new TypeError('Network unavailable'))
    await expect(createProjectWithSync('Ambiguous A')).rejects.toMatchObject({
      name: 'AmbiguousProjectCreateError',
    })
    const ambiguousKey = mocks.createProject.mock.calls[0][1]
    mocks.createProject.mockReset()
    mocks.createProject.mockResolvedValue(createMockProject('server_b', 'Different name'))

    await createProjectWithSync('Different name')

    expect(mocks.createProject.mock.calls[0][1]).not.toBe(ambiguousKey)
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
