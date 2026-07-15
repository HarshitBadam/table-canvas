import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectNode } from '@/types'

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

import { ensureTableMaterialized } from '@/engine/materializationService'
import {
  createProjectWithSync,
  fetchProjects,
  loadProjectWithSync,
} from '@/persistence/syncService'
import { loadOrCreateProject, materializeProjectTables } from './projectLifecycle'

beforeEach(() => {
  vi.mocked(createProjectWithSync).mockReset()
  vi.mocked(fetchProjects).mockReset()
  vi.mocked(loadProjectWithSync).mockReset()
})

function tableNode(id: string, kind: 'source_table' | 'derived_table'): ProjectNode {
  return {
    id,
    kind,
    name: id,
    ui: { position: { x: 0, y: 0 } },
    plan: kind === 'source_table'
      ? {
          fileRef: `file-${id}`,
          fileName: `${id}.csv`,
          fileType: 'csv',
          inferredSchemaVersion: 1,
        }
      : {
          transformDef: {
            type: 'filter',
            sourceTableId: 'source',
            conditions: [],
            logic: 'and',
          },
          upstreamNodeIds: ['source'],
        },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ProjectNode
}

describe('materializeProjectTables', () => {
  it('materializes source tables before derived tables regardless of insertion order', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(ensureTableMaterialized)
      .mockRejectedValueOnce(new Error('source failed'))
      .mockResolvedValueOnce({ status: 'computed', tableId: 'derived' })
    const nodes = {
      derived: tableNode('derived', 'derived_table'),
      source: tableNode('source', 'source_table'),
    }

    const summary = await materializeProjectTables(nodes)

    expect(ensureTableMaterialized).toHaveBeenNthCalledWith(1, 'source')
    expect(ensureTableMaterialized).toHaveBeenNthCalledWith(2, 'derived')
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(summary).toEqual({
      completedTableIds: ['derived'],
      failures: [{ tableId: 'source', error: 'source failed' }],
    })
    errorSpy.mockRestore()
  })

  it('reports error results instead of silently treating them as completed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(ensureTableMaterialized).mockResolvedValueOnce({
      status: 'error',
      tableId: 'source',
      error: 'Missing workbook file',
    })

    const summary = await materializeProjectTables({
      source: tableNode('source', 'source_table'),
    })

    expect(summary).toEqual({
      completedTableIds: [],
      failures: [{ tableId: 'source', error: 'Missing workbook file' }],
    })
    expect(errorSpy).toHaveBeenCalledWith(
      '[AppContext] Failed to materialize table source: Missing workbook file',
    )
    errorSpy.mockRestore()
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
