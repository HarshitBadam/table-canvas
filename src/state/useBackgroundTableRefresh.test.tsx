import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addFilter,
  addSource,
  clean,
  resetStore,
} from '@/engine/integrationTestUtils'
import { useProjectStore } from './projectStore'
import { useBackgroundTableRefresh } from './useBackgroundTableRefresh'

const ensureTableMaterialized = vi.hoisted(() => vi.fn())

vi.mock('@/engine/materializationService', () => ({
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
})
