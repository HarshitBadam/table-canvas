import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWindowedRows } from './useWindowedRows'
import type { ColumnSchema } from '@/types'
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

  it('invalidate clears window and refetches', async () => {
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

  it('clears stale rows and error state before a clean retry', async () => {
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
    expect(result.current.getLoadedRows().size).toBe(0)
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
