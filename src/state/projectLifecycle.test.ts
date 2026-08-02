import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/engine', () => ({
  getEngine: vi.fn(() => ({ init: vi.fn() })),
}))
vi.mock('@/engine/materializationService', () => ({
  ensureTableMaterialized: vi.fn(),
}))
vi.mock('@/persistence/syncService', () => ({
  createProjectWithSync: vi.fn(),
  fetchProjects: vi.fn(),
  loadProjectWithSync: vi.fn(),
}))

import {
  createProjectWithSync,
  fetchProjects,
  loadProjectWithSync,
} from '@/persistence/syncService'
import { hasProjectTables, loadOrCreateProject } from './projectLifecycle'

beforeEach(() => {
  vi.mocked(createProjectWithSync).mockReset()
  vi.mocked(fetchProjects).mockReset()
  vi.mocked(loadProjectWithSync).mockReset()
})

describe('hasProjectTables', () => {
  it('detects source and derived tables without requiring eager materialization', () => {
    expect(hasProjectTables({})).toBe(false)
    expect(hasProjectTables({
      chart: { kind: 'chart' },
    })).toBe(false)
    expect(hasProjectTables({
      source: { kind: 'source_table' },
    })).toBe(true)
    expect(hasProjectTables({
      derived: { kind: 'derived_table' },
    })).toBe(true)
  })
})

describe('loadOrCreateProject', () => {
  const project = {
    id: 'project-1',
    name: 'Existing project',
    nodes: {},
    edges: {},
    patches: {},
  }

  it('creates one starter project only when the project list is empty', async () => {
    vi.mocked(fetchProjects).mockResolvedValue([])
    vi.mocked(createProjectWithSync).mockResolvedValue(project)

    const result = await loadOrCreateProject()

    expect(createProjectWithSync).toHaveBeenCalledOnce()
    expect(result.project).toBe(project)
    expect(result.projectList).toEqual([
      expect.objectContaining({ id: project.id, name: project.name }),
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
    expect(createProjectWithSync).not.toHaveBeenCalled()
  })
})
