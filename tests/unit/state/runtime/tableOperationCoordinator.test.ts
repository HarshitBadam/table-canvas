import { beforeEach, describe, expect, it } from 'vitest'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import {
  beginTableOperation,
  cancelTableOperation,
  clearAllTableOperations,
  completeTableOperation,
  failTableOperation,
  isTableOperationCurrent,
  updateTableOperation,
  waitForTableOperation,
} from '@/state/runtime/tableOperationCoordinator'

beforeEach(() => {
  useTableRuntimeStore.getState().resetRuntime()
})

describe('tableOperationCoordinator', () => {
  it('marks a table as reading immediately and completes to ready', () => {
    const generation = beginTableOperation('table-a', 'reading')
    expect(useTableRuntimeStore.getState().cacheInfo['table-a']).toMatchObject({
      phase: 'reading',
      isDirty: true,
      operationGeneration: generation,
    })

    expect(updateTableOperation('table-a', generation, { phase: 'materializing' })).toBe(true)
    expect(useTableRuntimeStore.getState().cacheInfo['table-a']).toMatchObject({
      phase: 'materializing',
      isComputing: true,
    })

    expect(completeTableOperation('table-a', generation)).toBe(true)
    expect(useTableRuntimeStore.getState().cacheInfo['table-a']).toMatchObject({
      phase: 'ready',
      isComputing: false,
      isDirty: false,
    })
  })

  it('ignores stale completions after cancel or a newer begin', async () => {
    const first = beginTableOperation('table-a', 'uploading')
    const wait = waitForTableOperation('table-a')
    cancelTableOperation('table-a')
    await wait

    expect(failTableOperation('table-a', first, 'stale')).toBe(false)
    const second = beginTableOperation('table-a', 'waiting')
    expect(isTableOperationCurrent('table-a', first)).toBe(false)
    expect(isTableOperationCurrent('table-a', second)).toBe(true)
    expect(completeTableOperation('table-a', first)).toBe(false)
    expect(completeTableOperation('table-a', second)).toBe(true)
  })

  it('keeps waiters blocked through materializing until the operation completes', async () => {
    const generation = beginTableOperation('source', 'reading')
    let released = false
    const waiter = waitForTableOperation('source').then(() => {
      released = true
    })

    expect(released).toBe(false)
    updateTableOperation('source', generation, { phase: 'materializing' })
    await Promise.resolve()
    expect(released).toBe(false)

    expect(completeTableOperation('source', generation)).toBe(true)
    await waiter
    expect(released).toBe(true)
  })

  it('releases every gate on clearAllTableOperations', async () => {
    beginTableOperation('a', 'reading')
    beginTableOperation('b', 'uploading')
    let released = 0
    const waits = Promise.all([
      waitForTableOperation('a').then(() => { released += 1 }),
      waitForTableOperation('b').then(() => { released += 1 }),
    ])
    clearAllTableOperations()
    await waits
    expect(released).toBe(2)
  })
})
