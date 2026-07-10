import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '@/state/projectStore'
import { getComputationOrder } from './dependencyGraph'
import {
  addFilter,
  addJoin,
  addSource,
  clean,
  derived,
  resetStore,
} from './integrationTestUtils'

beforeEach(resetStore)

describe('dirty propagation', () => {
  it('marks downstream nodes dirty when a source changes', () => {
    const sourceId = addSource('A')
    const middleId = addFilter(sourceId, 'B')
    const finalId = addFilter(middleId, 'C')
    clean(middleId, finalId)
    expect(derived(middleId).cacheInfo?.isDirty).toBeFalsy()
    expect(derived(finalId).cacheInfo?.isDirty).toBeFalsy()

    useProjectStore.getState().setCellValue(sourceId, 'row_1', 'col1', 'new value')

    expect(derived(middleId).cacheInfo?.isDirty).toBe(true)
    expect(derived(finalId).cacheInfo?.isDirty).toBe(true)
  })

  it('propagates dirty state to all branches', () => {
    const sourceId = addSource('A')
    const leftId = addFilter(sourceId, 'B')
    const rightId = addFilter(sourceId, 'C')
    clean(leftId, rightId)

    useProjectStore.getState().setCellValue(sourceId, 'row_1', 'col1', 'changed')

    expect(derived(leftId).cacheInfo?.isDirty).toBe(true)
    expect(derived(rightId).cacheInfo?.isDirty).toBe(true)
  })

  it('handles a diamond dependency pattern', () => {
    const sourceId = addSource('A')
    const leftId = addFilter(sourceId, 'B')
    const rightId = addFilter(sourceId, 'C')
    const joinedId = addJoin(leftId, rightId, 'D')
    clean(leftId, rightId, joinedId)

    useProjectStore.getState().setCellValue(sourceId, 'row_1', 'col1', 'new')

    expect(derived(leftId).cacheInfo?.isDirty).toBe(true)
    expect(derived(rightId).cacheInfo?.isDirty).toBe(true)
    expect(derived(joinedId).cacheInfo?.isDirty).toBe(true)
  })

  it('does not affect unrelated tables', () => {
    const sourceAId = addSource('A')
    const derivedAId = addFilter(sourceAId, 'B')
    const sourceXId = addSource('X')
    const derivedXId = addFilter(sourceXId, 'Y')
    clean(derivedAId, derivedXId)

    useProjectStore.getState().setCellValue(sourceAId, 'row_1', 'col1', 'new')

    expect(derived(derivedAId).cacheInfo?.isDirty).toBe(true)
    expect(derived(derivedXId).cacheInfo?.isDirty).toBe(false)
  })
})

describe('cycle prevention', () => {
  it('detects a cycle through the store', () => {
    const sourceId = addSource('A')
    addFilter(sourceId, 'B')
    const state = useProjectStore.getState()
    const derivedId = Object.keys(state.nodes).find(id => state.nodes[id].name === 'B')!
    expect(state.wouldCreateCycle(derivedId, sourceId)).toBe(true)
  })

  it('allows valid non-cyclic connections', () => {
    const sourceAId = addSource('A')
    const derivedId = addFilter(sourceAId, 'B')
    const sourceCId = addSource('C')
    const store = useProjectStore.getState()
    expect(store.wouldCreateCycle(derivedId, 'new_table_d')).toBe(false)
    expect(store.wouldCreateCycle(sourceCId, derivedId)).toBe(false)
  })
})

describe('computation order', () => {
  it('computes a chain in dependency order', () => {
    const sourceId = addSource('A')
    const middleId = addFilter(sourceId, 'B')
    const finalId = addFilter(middleId, 'C')
    const state = useProjectStore.getState()
    const order = getComputationOrder(finalId, state.nodes, state.edges)
    expect(order.indexOf(sourceId)).toBeLessThan(order.indexOf(middleId))
    expect(order.indexOf(middleId)).toBeLessThan(order.indexOf(finalId))
    expect(order.length).toBe(3)
  })

  it('computes both join inputs before the join', () => {
    const leftId = addSource('A')
    const rightId = addSource('B')
    const joinedId = addJoin(leftId, rightId, 'C')
    const state = useProjectStore.getState()
    const order = getComputationOrder(joinedId, state.nodes, state.edges)
    expect(order.indexOf(leftId)).toBeLessThan(order.indexOf(joinedId))
    expect(order.indexOf(rightId)).toBeLessThan(order.indexOf(joinedId))
    expect(order.length).toBe(3)
  })
})
