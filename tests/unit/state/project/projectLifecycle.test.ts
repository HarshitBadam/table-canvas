import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/engine', () => ({
  getEngine: vi.fn(() => ({ init: vi.fn() })),
}))
vi.mock('@/engine/materialization/materializationService', () => ({
  ensureTableMaterialized: vi.fn(),
}))
vi.mock('@/persistence/sync/session/syncService', () => ({
  fetchProjects: vi.fn(),
  loadProjectWithSync: vi.fn(),
  createProjectWithSync: vi.fn(),
}))

import {
  createProjectWithSync,
  fetchProjects,
  loadProjectWithSync,
} from '@/persistence/sync/session/syncService'
import { loadOrCreateProject } from '@/state/project/projectLifecycle'

beforeEach(() => {
  vi.mocked(fetchProjects).mockReset()
  vi.mocked(loadProjectWithSync).mockReset()
  vi.mocked(createProjectWithSync).mockReset()
})

describe('loadOrCreateProject', () => {
  const project = {
    id: 'project-1',
    name: 'Existing project',
    nodes: {},
    edges: {},
    patches: {},
  }

  it('creates an Untitled Project so a fresh guest or account never lands on an empty prompt', async () => {
    vi.mocked(fetchProjects).mockResolvedValue([])
    const created = {
      id: 'project-new',
      name: 'Untitled Project',
      nodes: {},
      edges: {},
      patches: {},
    }
    vi.mocked(createProjectWithSync).mockResolvedValue(created)

    const result = await loadOrCreateProject()

    expect(createProjectWithSync).toHaveBeenCalledWith('Untitled Project')
    expect(result.project).toEqual(created)
    expect(result.projectList).toEqual([
      expect.objectContaining({ id: 'project-new', name: 'Untitled Project' }),
    ])
  })

  it('does not create a replacement when a listed project fails to load', async () => {
    vi.mocked(fetchProjects).mockResolvedValue([{
      id: project.id,
      name: project.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    }])
    vi.mocked(loadProjectWithSync).mockResolvedValue(null)

    await expect(loadOrCreateProject()).rejects.toThrow(
      `Project "${project.name}" is unavailable`,
    )
  })
})
