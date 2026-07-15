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

describe('duplicateNode', () => {
  it('creates an offset copy with a unique name and independent patches', () => {
    const tableId = addSource('Sales')
    const store = useProjectStore.getState()
    store.setCellValue(tableId, 'row-1', 'col1', 'edited')

    const duplicateId = store.duplicateNode(tableId)
    expect(duplicateId).toBeDefined()

    const nextState = useProjectStore.getState()
    const duplicate = nextState.nodes[duplicateId!]
    expect(duplicate).toMatchObject({
      name: 'Sales copy',
      ui: { position: { x: 132, y: 132 } },
    })
    expect(nextState.selectedNodeId).toBe(duplicateId)
    expect(nextState.patches[duplicateId!]).toEqual(nextState.patches[tableId])
    expect(nextState.patches[duplicateId!]).not.toBe(nextState.patches[tableId])
  })
})
