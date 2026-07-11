import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  resetStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('node cache metadata', () => {
  it('does not invalidate the logical data timestamp when materialization status changes', () => {
    const tableId = addSource('Source')
    const originalUpdatedAt = useProjectStore.getState().nodes[tableId].updatedAt
    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'))

    useProjectStore.getState().updateCacheInfo(tableId, {
      isComputing: true,
      lastRowCount: 100,
    })

    expect(useProjectStore.getState().nodes[tableId].updatedAt).toBe(originalUpdatedAt)
  })
})
