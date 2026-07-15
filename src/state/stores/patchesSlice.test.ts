import { beforeEach, describe, expect, it } from 'vitest'
import {
  addFilter,
  addSource,
  clean,
  derived,
  resetStore,
  source,
} from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'

beforeEach(() => {
  resetStore()
})

describe('setCellValue', () => {
  it('marks the edited source and every descendant dirty and retryable', () => {
    const sourceId = addSource('Source')
    const childId = addFilter(sourceId, 'Child')
    const grandchildId = addFilter(childId, 'Grandchild')
    clean(sourceId, childId, grandchildId)
    useProjectStore.getState().updateCacheInfo(sourceId, { error: 'source failed' })
    useProjectStore.getState().updateCacheInfo(childId, { error: 'child failed' })
    useProjectStore.getState().updateCacheInfo(grandchildId, { error: 'grandchild failed' })

    useProjectStore.getState().setCellValue(sourceId, 'row-1', 'col1', 'edited')

    for (const node of [source(sourceId), derived(childId), derived(grandchildId)]) {
      expect(node.cacheInfo?.isDirty).toBe(true)
      expect(node.cacheInfo?.error).toBeUndefined()
    }
  })

  it('increments each affected table revision exactly once', () => {
    const sourceId = addSource('Source')
    const childId = addFilter(sourceId, 'Child')
    const grandchildId = addFilter(childId, 'Grandchild')
    useProjectStore.getState().updateCacheInfo(sourceId, { dataRevision: 4 })
    useProjectStore.getState().updateCacheInfo(childId, { dataRevision: 7 })
    useProjectStore.getState().updateCacheInfo(grandchildId, { dataRevision: 10 })

    useProjectStore.getState().setCellValue(sourceId, 'row-1', 'col1', 'edited')

    expect(source(sourceId).cacheInfo?.dataRevision).toBe(5)
    expect(derived(childId).cacheInfo?.dataRevision).toBe(8)
    expect(derived(grandchildId).cacheInfo?.dataRevision).toBe(11)
  })
})
