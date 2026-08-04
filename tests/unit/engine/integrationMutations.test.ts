import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '@/state/projectStore'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import {
  addFilter,
  addSource,
  cacheOf,
  clean,
  resetStore,
} from '@/engine/integrationTestUtils'

beforeEach(resetStore)

describe('schema change propagation', () => {
  it('marks downstream dirty when a column is added', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().addColumn(sourceId, 'NewColumn', 'string')

    expect(cacheOf(derivedId)?.isDirty).toBe(true)
  })

  it('marks downstream dirty when a column is renamed', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().renameColumn(sourceId, 'col1', 'RenamedID')

    expect(cacheOf(derivedId)?.isDirty).toBe(true)
  })
})

describe('row operation propagation', () => {
  it('marks downstream dirty when a row is inserted', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().insertRow(sourceId, 'new_row_id', { col1: 'test', col2: 42 }, 0)

    expect(cacheOf(derivedId)?.isDirty).toBe(true)
  })

  it('marks downstream dirty when a row is deleted', () => {
    const sourceId = addSource('A')
    const derivedId = addFilter(sourceId, 'B')
    clean(derivedId)

    useProjectStore.getState().deleteRow(sourceId, 'row_1')

    expect(cacheOf(derivedId)?.isDirty).toBe(true)
  })
})

describe('cache info management', () => {
  it('updates cache info', () => {
    const sourceId = addSource('A')
    const timestamp = new Date().toISOString()
    useTableRuntimeStore.getState().updateCacheInfo(sourceId, {
      isDirty: false,
      lastComputedAt: timestamp,
      currentVersionHash: 'abc123',
      lastRowCount: 100,
    })

    const cacheInfo = cacheOf(sourceId)
    expect(cacheInfo?.isDirty).toBe(false)
    expect(cacheInfo?.lastComputedAt).toBe(timestamp)
    expect(cacheInfo?.currentVersionHash).toBe('abc123')
    expect(cacheInfo?.lastRowCount).toBe(100)
  })

  it('clears node errors', () => {
    const sourceId = addSource('A')
    const runtime = useTableRuntimeStore.getState()
    runtime.updateCacheInfo(sourceId, { error: 'Test error' })
    expect(cacheOf(sourceId)?.error).toBe('Test error')

    runtime.clearNodeError(sourceId)

    expect(cacheOf(sourceId)?.error).toBeUndefined()
  })
})
