import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWindowedRows } from './useWindowedRows'
import type { ColumnSchema } from '@/types'
import type { TableSlice } from '@/engine/types'
import type { GridRow } from '../types'

const mocks = vi.hoisted(() => ({
  getSlice: vi.fn(),
  getFilteredSlice: vi.fn(),
  init: vi.fn(),
  ensureTableMaterialized: vi.fn(),
}))

vi.mock('@/engine/EngineAdapter', () => ({
  getEngine: () => ({
    getSlice: mocks.getSlice,
    getFilteredSlice: mocks.getFilteredSlice,
    init: mocks.init,
  }),
}))

vi.mock('@/engine/materializationService', () => ({
  ensureTableMaterialized: mocks.ensureTableMaterialized,
}))

const testColumns: ColumnSchema[] = [
  { id: 'col_name', name: 'Name', type: 'string', nullable: true },
  { id: 'col_age', name: 'Age', type: 'number', nullable: true },
]

function deferredSlice() {
  let resolve!: (value: TableSlice) => void
  const promise = new Promise<TableSlice>(fulfill => {
    resolve = fulfill
  })
  return { promise, resolve }
}

describe('useWindowedRows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureTableMaterialized.mockResolvedValue({ status: 'computed' })
    mocks.getSlice.mockResolvedValue({
      tableId: 'test_table',
      offset: 0,
      limit: 100,
      rows: Array.from({ length: 50 }, (_, i) => ({
        __rowId: `row_${i}`,
        Name: `Person ${i}`,
        Age: 20 + i,
      })),
      totalRows: 500000,
    })
  })

  it('fetches initial window from engine with bounded offset/limit', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(mocks.getSlice).toHaveBeenCalledWith('test_table', 0, 100, testColumns)
    expect(result.current.totalRows).toBe(500000)
  })

  it('getRowAtIndex returns rows within the window', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    const row = result.current.getRowAtIndex(0)
    expect(row).not.toBeNull()
    expect(row?.__rowId).toBe('row_0')
  })

  it('getRowAtIndex returns null for indices outside window', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    let row: GridRow | null = null
    await act(async () => {
      row = result.current.getRowAtIndex(999)
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(row).toBeNull()
  })

  it('retains adjacent rows while keeping the cache bounded', async () => {
    mocks.getSlice.mockImplementation(async (_tableId, offset: number, limit: number) => ({
      tableId: 'test_table',
      offset,
      limit,
      rows: Array.from({ length: limit }, (_, index) => ({
        __rowId: `row_${offset + index}`,
        Name: `Person ${offset + index}`,
        Age: offset + index,
      })),
      totalRows: 500_000,
    }))
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      result.current.getRowAtIndex(105)
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    expect(result.current.getRowAtIndex(0)?.__rowId).toBe('row_0')
    expect(result.current.getRowAtIndex(100)?.__rowId).toBe('row_100')
    expect(result.current.getLoadedRows().size).toBeLessThanOrEqual(300)
  })

  it('uses getFilteredSlice when filters are provided', async () => {
    mocks.getFilteredSlice.mockResolvedValue({
      tableId: 'test_table',
      offset: 0,
      limit: 100,
      rows: [{ __rowId: 'row_0', Name: 'Alice', Age: 30 }],
      totalRows: 1,
    })

    const filters = {
      conditions: [{ columnId: 'col_name', operator: 'equals' as const, value: 'Alice' }],
      logic: 'and' as const,
    }

    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, filters, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(mocks.getFilteredSlice).toHaveBeenCalled()
    expect(result.current.totalRows).toBe(1)
  })

  it('invalidate refetches the current window', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    const callsBefore = mocks.getSlice.mock.calls.length

    await act(async () => {
      result.current.invalidate()
      await new Promise(r => setTimeout(r, 50))
    })

    expect(mocks.getSlice.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('keeps an already-loaded grid visible while a cell edit refresh is pending', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    let resolveRefresh!: (slice: {
      rows: Array<{ __rowId: string; Name: string; Age: number }>
      totalRows: number
    }) => void
    mocks.getSlice.mockReturnValueOnce(new Promise(resolve => {
      resolveRefresh = resolve
    }))

    act(() => result.current.invalidate())

    expect(result.current.totalRows).toBe(500000)
    expect(result.current.getRowAtIndex(0)?.__rowId).toBe('row_0')
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolveRefresh({
        rows: [{ __rowId: 'row_updated', Name: 'Updated', Age: 42 }],
        totalRows: 1,
      })
      await Promise.resolve()
    })
    expect(result.current.totalRows).toBe(1)
    expect(result.current.getRowAtIndex(0)?.__rowId).toBe('row_updated')
  })

  it('does not query a stale engine table when materialization fails', async () => {
    mocks.ensureTableMaterialized.mockResolvedValue({
      status: 'error',
      error: 'Source file is unavailable. Re-import it.',
    })

    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    expect(mocks.getSlice).not.toHaveBeenCalled()
    expect(mocks.getFilteredSlice).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Source file is unavailable. Re-import it.')
  })

  it('preserves visible rows through a failed refresh and atomically replaces them on retry', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(result.current.getRowAtIndex(0)?.__rowId).toBe('row_0')

    mocks.ensureTableMaterialized.mockResolvedValueOnce({
      status: 'error',
      error: 'Temporary materialization failure',
    })
    await act(async () => {
      result.current.invalidate()
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(result.current.getLoadedRows().size).toBe(50)
    expect(result.current.totalRows).toBe(500000)
    expect(result.current.error).toBe('Temporary materialization failure')

    mocks.ensureTableMaterialized.mockResolvedValueOnce({ status: 'computed' })
    await act(async () => {
      result.current.invalidate()
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(result.current.error).toBeNull()
    expect(result.current.getRowAtIndex(0)?.__rowId).toBe('row_0')
  })

  it('generation guard: new fetch after invalidate uses latest generation', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(result.current.totalRows).toBe(500000)

    mocks.getSlice.mockResolvedValueOnce({
      tableId: 'test_table', offset: 0, limit: 100,
      rows: [{ __rowId: 'row_new', Name: 'Fresh', Age: 1 }],
      totalRows: 42,
    })

    await act(async () => {
      result.current.invalidate()
      await new Promise(r => setTimeout(r, 50))
    })

    expect(result.current.totalRows).toBe(42)
  })

  it('runs a queued filter request with the latest filter configuration', async () => {
    const stale = deferredSlice()
    const fresh = deferredSlice()
    mocks.getSlice.mockReturnValueOnce(stale.promise)
    mocks.getFilteredSlice.mockReturnValueOnce(fresh.promise)
    const initialFilters = null
    const nextFilters = {
      conditions: [{ columnId: 'col_name', operator: 'equals' as const, value: 'Fresh' }],
      logic: 'and' as const,
    }
    const { result, rerender } = renderHook(
      ({ filters }) => useWindowedRows('test_table', testColumns, filters, undefined, undefined),
      { initialProps: { filters: initialFilters as typeof nextFilters | null } },
    )
    await waitFor(() => expect(mocks.getSlice).toHaveBeenCalledOnce())

    rerender({ filters: nextFilters })
    await act(async () => {
      stale.resolve({
        tableId: 'test_table',
        offset: 0,
        limit: 100,
        rows: [{ __rowId: 'stale', Name: 'Stale', Age: 1 }],
        totalRows: 1,
      })
      await stale.promise
    })
    await waitFor(() => expect(mocks.getFilteredSlice).toHaveBeenCalledOnce())
    expect(mocks.getFilteredSlice).toHaveBeenCalledWith(expect.objectContaining({
      tableId: 'test_table',
      filters: [expect.objectContaining({ column: 'Name', value: 'Fresh' })],
    }))

    await act(async () => {
      fresh.resolve({
        tableId: 'test_table',
        offset: 0,
        limit: 100,
        rows: [{ __rowId: 'fresh', Name: 'Fresh', Age: 2 }],
        totalRows: 1,
      })
      await fresh.promise
    })
    expect(result.current.getRowAtIndex(0)?.__rowId).toBe('fresh')
  })

  it('runs a queued table request against the newly selected table', async () => {
    const stale = deferredSlice()
    const fresh = deferredSlice()
    mocks.getSlice.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
    const { result, rerender } = renderHook(
      ({ tableId }) => useWindowedRows(tableId, testColumns, null, undefined, undefined),
      { initialProps: { tableId: 'project_a_table' } },
    )
    await waitFor(() => expect(mocks.getSlice).toHaveBeenCalledOnce())

    rerender({ tableId: 'project_b_table' })
    await act(async () => {
      stale.resolve({
        tableId: 'project_a_table',
        offset: 0,
        limit: 100,
        rows: [{ __rowId: 'project-a-row', Name: 'Old project', Age: 1 }],
        totalRows: 1,
      })
      await stale.promise
    })
    await waitFor(() => expect(mocks.getSlice).toHaveBeenCalledTimes(2))
    expect(mocks.getSlice.mock.calls[1][0]).toBe('project_b_table')

    await act(async () => {
      fresh.resolve({
        tableId: 'project_b_table',
        offset: 0,
        limit: 100,
        rows: [{ __rowId: 'project-b-row', Name: 'New project', Age: 2 }],
        totalRows: 1,
      })
      await fresh.promise
    })
    expect(result.current.getRowAtIndex(0)?.__rowId).toBe('project-b-row')
  })

  it('does NOT store full table in dataStore (memory bounded)', async () => {
    renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    const calls = mocks.getSlice.mock.calls
    for (const call of calls) {
      expect(call[2]).toBeLessThanOrEqual(100)
    }
  })
})
