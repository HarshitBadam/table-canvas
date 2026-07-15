import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartConfig, ColumnSchema } from '@/types'
import { useChartData } from './useChartData'

const mocks = vi.hoisted(() => ({
  ensureTableMaterialized: vi.fn(),
  init: vi.fn(),
  getSlice: vi.fn(),
  getAggregation: vi.fn(),
}))

vi.mock('@/engine/materializationService', () => ({
  ensureTableMaterialized: mocks.ensureTableMaterialized,
}))

vi.mock('@/engine/EngineAdapter', () => ({
  getEngine: () => ({
    init: mocks.init,
    getSlice: mocks.getSlice,
    getAggregation: mocks.getAggregation,
  }),
}))

const config: ChartConfig = { xAxis: 'category', yAxis: 'amount' }
const columns: ColumnSchema[] = [
  { id: 'category', name: 'Category', type: 'string', nullable: true },
  { id: 'amount', name: 'Amount', type: 'number', nullable: true },
]

describe('useChartData materialization gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.init.mockResolvedValue(undefined)
    mocks.getSlice.mockResolvedValue({
      rows: [{ __rowId: 'row_1', category: 'A', amount: 10 }],
      totalRows: 1,
    })
  })

  it('surfaces the exact materialization error without reading stale engine data', async () => {
    mocks.ensureTableMaterialized.mockResolvedValue({
      status: 'error',
      error: 'Upstream Orders failed: missing source file',
    })

    const { result } = renderHook(() =>
      useChartData('table-1', config, 'version-1', columns)
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Upstream Orders failed: missing source file')
    expect(mocks.init).not.toHaveBeenCalled()
    expect(mocks.getSlice).not.toHaveBeenCalled()
    expect(mocks.getAggregation).not.toHaveBeenCalled()
  })

  it('can refetch successfully after a materialization error', async () => {
    mocks.ensureTableMaterialized
      .mockResolvedValueOnce({ status: 'error', error: 'Temporary failure' })
      .mockResolvedValueOnce({ status: 'computed' })

    const { result } = renderHook(() =>
      useChartData('table-1', config, 'version-1', columns)
    )
    await waitFor(() => expect(result.current.error).toBe('Temporary failure'))

    act(() => result.current.refetch())

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.error).toBeNull()
    expect(mocks.getSlice).toHaveBeenCalledTimes(1)
  })
})
