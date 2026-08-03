import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addFilter,
  addSource,
  clean,
  resetStore,
} from '@/engine/integrationTestUtils'
import type { DerivedTableNode, Edge, ProjectNode, SourceTableNode } from '@/types'
import { useProjectStore } from '@/state/projectStore'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import { getDirtyTableRefreshOrder, useBackgroundTableRefresh } from '@/state/runtime/useBackgroundTableRefresh'

const ensureTableMaterialized = vi.hoisted(() => vi.fn())

vi.mock('@/engine/materialization/materializationService', () => ({
  ensureTableMaterialized,
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  ensureTableMaterialized.mockResolvedValue({ status: 'computed' })
  resetStore()
})

afterEach(() => {
  vi.useRealTimers()
})

function sourceTable(id: string, rowCount: number): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schema: { columns: [], rowCount },
    plan: {
      fileRef: `file-${id}`,
      fileName: `${id}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
  }
}

function derivedTable(id: string, upstreamNodeIds: string[], rowCount: number): DerivedTableNode {
  return {
    id,
    kind: 'derived_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schema: { columns: [], rowCount },
    plan: {
      transformDef: { type: 'combine', operation: 'union' } as never,
      upstreamNodeIds,
    },
  }
}

function edge(id: string, fromNodeId: string, toNodeId: string): Edge {
  return { id, fromNodeId, toNodeId, transformType: 'reference' }
}

describe('getDirtyTableRefreshOrder', () => {
  it('sorts independent dirty tables smallest row count first', () => {
    const nodes: Record<string, ProjectNode> = {
      big: sourceTable('big', 500_000),
      small: sourceTable('small', 10),
      medium: sourceTable('medium', 1_000),
    }
    const cacheInfo = {
      big: { isDirty: true },
      small: { isDirty: true },
      medium: { isDirty: true },
    }

    expect(getDirtyTableRefreshOrder(nodes, {}, cacheInfo)).toEqual(['small', 'medium', 'big'])
  })

  it('always keeps a table after everything it depends on, even if it is smaller', () => {
    const nodes: Record<string, ProjectNode> = {
      hugeSource: sourceTable('hugeSource', 500_000),
      tinyDerived: derivedTable('tinyDerived', ['hugeSource'], 1),
    }
    const edges: Record<string, Edge> = {
      e1: edge('e1', 'hugeSource', 'tinyDerived'),
    }
    const cacheInfo = {
      hugeSource: { isDirty: true },
      tinyDerived: { isDirty: true },
    }

    expect(getDirtyTableRefreshOrder(nodes, edges, cacheInfo)).toEqual(['hugeSource', 'tinyDerived'])
  })

  it('sorts smallest-first within a dependency level, independent of edges elsewhere', () => {
    const nodes: Record<string, ProjectNode> = {
      root: sourceTable('root', 10),
      bigChild: derivedTable('bigChild', ['root'], 400_000),
      smallChild: derivedTable('smallChild', ['root'], 5),
    }
    const edges: Record<string, Edge> = {
      e1: edge('e1', 'root', 'bigChild'),
      e2: edge('e2', 'root', 'smallChild'),
    }
    const cacheInfo = {
      root: { isDirty: true },
      bigChild: { isDirty: true },
      smallChild: { isDirty: true },
    }

    expect(getDirtyTableRefreshOrder(nodes, edges, cacheInfo)).toEqual(['root', 'smallChild', 'bigChild'])
  })

  it('ignores clean tables and chart nodes', () => {
    const nodes: Record<string, ProjectNode> = {
      clean: sourceTable('clean', 1),
      dirty: sourceTable('dirty', 1),
    }
    const cacheInfo = {
      clean: { isDirty: false },
      dirty: { isDirty: true },
    }

    expect(getDirtyTableRefreshOrder(nodes, {}, cacheInfo)).toEqual(['dirty'])
  })

  it('falls back to insertion order when the graph has a cycle', () => {
    const nodes: Record<string, ProjectNode> = {
      a: sourceTable('a', 999),
      b: derivedTable('b', ['a'], 1),
    }
    const edges: Record<string, Edge> = {
      e1: edge('e1', 'a', 'b'),
      e2: edge('e2', 'b', 'a'),
    }
    const cacheInfo = {
      a: { isDirty: true },
      b: { isDirty: true },
    }

    expect(getDirtyTableRefreshOrder(nodes, edges, cacheInfo)).toEqual(['a', 'b'])
  })
})

describe('useBackgroundTableRefresh', () => {
  it('refreshes an edited table and its stale descendants in dependency order', async () => {
    const sourceId = addSource('Source')
    const childId = addFilter(sourceId, 'Child')
    const grandchildId = addFilter(childId, 'Grandchild')
    clean(sourceId, childId, grandchildId)
    renderHook(() => useBackgroundTableRefresh(true))

    act(() => {
      useProjectStore.getState().setCellValue(sourceId, 'row-1', 'col1', 'edited')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(ensureTableMaterialized.mock.calls.map(([tableId]) => tableId)).toEqual([
      sourceId,
      childId,
      grandchildId,
    ])
    expect(ensureTableMaterialized).toHaveBeenCalledWith(sourceId, { announce: false })
  })

  it('does not refresh unrelated clean tables', async () => {
    const editedId = addSource('Edited')
    const unrelatedId = addSource('Unrelated')
    clean(editedId, unrelatedId)
    renderHook(() => useBackgroundTableRefresh(true))

    act(() => {
      useProjectStore.getState().setCellValue(editedId, 'row-1', 'col1', 'edited')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(ensureTableMaterialized).toHaveBeenCalledOnce()
    expect(ensureTableMaterialized).toHaveBeenCalledWith(editedId, { announce: false })
  })

  it('drains the initial post-load warm-up immediately, smallest table first, skipping the edit debounce', async () => {
    useProjectStore.setState({
      nodes: { small: sourceTable('small', 5), big: sourceTable('big', 500_000) },
      edges: {},
    })
    useTableRuntimeStore.getState().markNodesDirty(['small', 'big'])

    renderHook(() => useBackgroundTableRefresh(true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(ensureTableMaterialized.mock.calls.map(([tableId]) => tableId)).toEqual(['small', 'big'])
  })

  it('still debounces a later edit-triggered dirty batch for the same project', async () => {
    const sourceId = addSource('Source')
    clean(sourceId)
    renderHook(() => useBackgroundTableRefresh(true))

    // Freshly-mounted hook treats the first dirty batch like a load warm-up.
    act(() => {
      useProjectStore.getState().setCellValue(sourceId, 'row-1', 'col1', 'first edit')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    ensureTableMaterialized.mockClear()
    // Mock never clears isDirty; do that so the next edit is a new dirty batch.
    act(() => {
      useTableRuntimeStore.getState().updateCacheInfo(sourceId, { isDirty: false })
    })

    act(() => {
      useProjectStore.getState().setCellValue(sourceId, 'row-1', 'col1', 'second edit')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(ensureTableMaterialized).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(ensureTableMaterialized).toHaveBeenCalledWith(sourceId, { announce: false })
  })
})
