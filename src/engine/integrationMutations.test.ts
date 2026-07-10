import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '@/state/projectStore'
import {
  addFilter,
  addSource,
  clean,
  derived,
  resetStore,
  source,
} from './integrationTestUtils'

beforeEach(resetStore)

describe('schema change propagation', () => {
  it('marks downstream dirty when a column is added', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().addColumn(sourceId, 'NewColumn', 'string')

    expect(derived(derivedId).cacheInfo?.isDirty).toBe(true)
  })

  it('marks downstream dirty when a column is renamed', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().renameColumn(sourceId, 'col1', 'RenamedID')

    expect(derived(derivedId).cacheInfo?.isDirty).toBe(true)
  })
})

describe('row operation propagation', () => {
  it('marks downstream dirty when a row is inserted', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().insertRow(sourceId, 'new_row_id', { col1: 'test', col2: 42 }, 0)

    expect(derived(derivedId).cacheInfo?.isDirty).toBe(true)
  })

  it('marks downstream dirty when a row is deleted', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().deleteRow(sourceId, 'row_1')

    expect(derived(derivedId).cacheInfo?.isDirty).toBe(true)
  })
})

describe('cache info management', () => {
  it('updates cache info', () => {
    const sourceId = addSource('A')
    const timestamp = new Date().toISOString()
    useProjectStore.getState().updateCacheInfo(sourceId, {
      isDirty: false,
      lastComputedAt: timestamp,
      currentVersionHash: 'abc123',
      lastRowCount: 100,
    })

    const cacheInfo = source(sourceId).cacheInfo
    expect(cacheInfo?.isDirty).toBe(false)
    expect(cacheInfo?.lastComputedAt).toBe(timestamp)
    expect(cacheInfo?.currentVersionHash).toBe('abc123')
    expect(cacheInfo?.lastRowCount).toBe(100)
  })

  it('clears node errors', () => {
    const sourceId = addSource('A')
    const store = useProjectStore.getState()
    store.updateCacheInfo(sourceId, { error: 'Test error' })
    expect(source(sourceId).cacheInfo?.error).toBe('Test error')

    store.clearNodeError(sourceId)

    expect(source(sourceId).cacheInfo?.error).toBeUndefined()
  })
})
