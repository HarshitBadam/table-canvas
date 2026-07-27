import { beforeEach, describe, expect, it } from 'vitest'
import {
  addFilter,
  addSource,
  cacheOf,
  clean,
  resetStore,
} from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'
import { updateNodeCacheInfo } from '@/state/tableRuntimeStore'

beforeEach(() => {
  resetStore()
})

describe('setCellValue', () => {
  it('marks the edited source and every descendant dirty and retryable', () => {
    const sourceId = addSource('Source')
    const childId = addFilter(sourceId, 'Child')
    const grandchildId = addFilter(childId, 'Grandchild')
    clean(sourceId, childId, grandchildId)
    updateNodeCacheInfo(sourceId, { error: 'source failed' })
    updateNodeCacheInfo(childId, { error: 'child failed' })
    updateNodeCacheInfo(grandchildId, { error: 'grandchild failed' })

    useProjectStore.getState().setCellValue(sourceId, 'row-1', 'col1', 'edited')

    for (const tableId of [sourceId, childId, grandchildId]) {
      expect(cacheOf(tableId)?.isDirty).toBe(true)
      expect(cacheOf(tableId)?.error).toBeUndefined()
    }
  })

  it('increments each affected table revision exactly once', () => {
    const sourceId = addSource('Source')
    const childId = addFilter(sourceId, 'Child')
    const grandchildId = addFilter(childId, 'Grandchild')
    updateNodeCacheInfo(sourceId, { dataRevision: 4 })
    updateNodeCacheInfo(childId, { dataRevision: 7 })
    updateNodeCacheInfo(grandchildId, { dataRevision: 10 })

    useProjectStore.getState().setCellValue(sourceId, 'row-1', 'col1', 'edited')

    expect(cacheOf(sourceId)?.dataRevision).toBe(5)
    expect(cacheOf(childId)?.dataRevision).toBe(8)
    expect(cacheOf(grandchildId)?.dataRevision).toBe(11)
  })
})
