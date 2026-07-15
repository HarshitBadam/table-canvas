import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGridData } from './useGridData'

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  projectState: {} as Record<string, unknown>,
}))

vi.mock('@/state/projectStore', () => ({
  useProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mocks.projectState),
}))

vi.mock('@/state/dataStore', () => ({
  useDataStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ tableData: {} }),
}))

vi.mock('@/engine/materializationService', () => ({
  ensureTableMaterialized: vi.fn().mockResolvedValue({ status: 'cached' }),
}))

vi.mock('./hooks/useWindowedRows', () => ({
  useWindowedRows: () => ({
    totalRows: 10,
    getRowAtIndex: vi.fn(),
    getLoadedRows: () => new Map(),
    ensureRange: vi.fn(),
    version: 1,
    isLoading: false,
    error: null,
    invalidate: mocks.invalidate,
  }),
}))

describe('useGridData patch invalidation', () => {
  beforeEach(() => {
    mocks.invalidate.mockClear()
    mocks.projectState = {
      nodes: {},
      patches: {},
      dataRevision: 0,
      getTableNode: () => ({
        id: 'table-1',
        kind: 'source_table',
        schema: {
          columns: [{ id: 'name', name: 'Name', type: 'string', nullable: true }],
        },
        cacheInfo: {
          isDirty: false,
          isComputing: false,
          lastComputedAt: '2026-01-01T00:00:00.000Z',
          dataRevision: mocks.projectState.dataRevision as number,
        },
      }),
      setTableFilters: vi.fn(),
    }
  })

  it('invalidates for the first data mutation', async () => {
    const { rerender } = renderHook(() => useGridData('table-1'))

    act(() => {
      mocks.projectState.patches = {
        'table-1': {
          cellPatches: { name: { row_1: 'Updated' } },
          highlightedCells: new Set<string>(),
        },
      }
      mocks.projectState.dataRevision = 1
      rerender()
    })

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1))
  })

  it('does not invalidate data when only highlights change', async () => {
    mocks.projectState.patches = {
      'table-1': {
        cellPatches: { name: { row_1: 'Updated' } },
        highlightedCells: new Set<string>(),
      },
    }
    mocks.projectState.dataRevision = 1
    const { rerender } = renderHook(() => useGridData('table-1'))

    act(() => {
      mocks.projectState.patches = {
        'table-1': {
          cellPatches: { name: { row_1: 'Updated' } },
          highlightedCells: new Set(['row_1:name']),
        },
      }
      rerender()
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })
})
