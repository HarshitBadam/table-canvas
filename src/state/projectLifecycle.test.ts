import { describe, expect, it, vi } from 'vitest'
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
import { materializeProjectTables } from './projectLifecycle'

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

    await materializeProjectTables(nodes)

    expect(ensureTableMaterialized).toHaveBeenNthCalledWith(1, 'source')
    expect(ensureTableMaterialized).toHaveBeenNthCalledWith(2, 'derived')
    expect(errorSpy).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })
})
