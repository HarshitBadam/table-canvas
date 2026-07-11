import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWindowedRows } from './useWindowedRows'
import type { ColumnSchema } from '@/types'
import type { GridRow } from '../types'

const mockGetSlice = vi.fn()
const mockGetFilteredSlice = vi.fn()
const mockInit = vi.fn()

vi.mock('@/engine/EngineAdapter', () => ({
  getEngine: () => ({
    getSlice: mockGetSlice,
    getFilteredSlice: mockGetFilteredSlice,
    init: mockInit,
  }),
}))

vi.mock('@/engine/materializationService', () => ({
  ensureTableMaterialized: vi.fn().mockResolvedValue({ status: 'computed' }),
}))

const testColumns: ColumnSchema[] = [
  { id: 'col_name', name: 'Name', type: 'string', nullable: true },
  { id: 'col_age', name: 'Age', type: 'number', nullable: true },
]

describe('useWindowedRows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSlice.mockResolvedValue({
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

    expect(mockGetSlice).toHaveBeenCalledWith('test_table', 0, 100, testColumns)
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
    mockGetSlice.mockImplementation(async (_tableId, offset: number, limit: number) => ({
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
    mockGetFilteredSlice.mockResolvedValue({
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

    expect(mockGetFilteredSlice).toHaveBeenCalled()
    expect(result.current.totalRows).toBe(1)
  })

  it('invalidate clears window and refetches', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    const callsBefore = mockGetSlice.mock.calls.length

    await act(async () => {
      result.current.invalidate()
      await new Promise(r => setTimeout(r, 50))
    })

    expect(mockGetSlice.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('generation guard: new fetch after invalidate uses latest generation', async () => {
    const { result } = renderHook(() =>
      useWindowedRows('test_table', testColumns, null, undefined, undefined)
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(result.current.totalRows).toBe(500000)

    mockGetSlice.mockResolvedValueOnce({
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

    const calls = mockGetSlice.mock.calls
    for (const call of calls) {
      expect(call[2]).toBeLessThanOrEqual(100)
    }
  })
})
