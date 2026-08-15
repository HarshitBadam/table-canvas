import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore, source } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'
import type { TransformCreationRequest } from '@/canvas/modals/useTransformCreation'

const mocks = vi.hoisted(() => ({
  getTableData: vi.fn(),
  countCombinedTransformRows: vi.fn(),
  finalizeCombinedTable: vi.fn(),
  user: { tier: 'guest' } as { tier: 'guest' | 'google' } | null,
}))

vi.mock('@/engine/materialization/tableDataService', () => ({
  getTableData: mocks.getTableData,
}))
vi.mock('@/engine/EngineAdapter', () => ({
  getEngine: () => ({ countCombinedTransformRows: mocks.countCombinedTransformRows }),
}))
vi.mock('@/canvas/modals/finalizeCombinedTable', () => ({
  finalizeCombinedTable: mocks.finalizeCombinedTable,
}))
vi.mock('@/state/AppContext', () => ({
  useAppAuth: () => ({ user: mocks.user }),
}))

import { useTransformCreation } from '@/canvas/modals/useTransformCreation'

function buildRequest(leftId: string, rightId: string): TransformCreationRequest {
  const leftCols = source(leftId).schema!.columns
  const rightCols = source(rightId).schema!.columns
  const allCols = [
    ...leftCols.map(c => ({ id: `L:${c.id}`, colId: c.id, side: 'L' as const })),
    ...rightCols.map(c => ({ id: `R:${c.id}`, colId: c.id, side: 'R' as const })),
  ]
  return {
    operation: 'join',
    joinType: 'inner',
    leftKey: 'col1',
    rightKey: 'col1',
    canUnion: true,
    selected: new Set(allCols.map(c => c.id)),
    outputName: 'Combined',
    leftNode: useProjectStore.getState().nodes[leftId],
    rightNode: useProjectStore.getState().nodes[rightId],
    sourceNodeId: leftId,
    targetNodeId: rightId,
    leftCols,
    rightCols,
    allCols,
    leftTotalRows: 10,
    rightTotalRows: 10,
  }
}

beforeEach(() => {
  resetStore()
  mocks.getTableData.mockReset().mockResolvedValue({ rows: [], totalRows: 0 })
  mocks.countCombinedTransformRows.mockReset().mockResolvedValue(3)
  mocks.finalizeCombinedTable.mockReset().mockResolvedValue(undefined)
  mocks.user = { tier: 'guest' }
})

describe('useTransformCreation', () => {
  it('creates the derived table and hands off to finalizeCombinedTable', async () => {
    const leftId = addSource('Left')
    const rightId = addSource('Right')
    const onClose = vi.fn()
    const onDismiss = vi.fn()

    const { result } = renderHook(() => useTransformCreation({ onClose, onDismiss }))

    await act(async () => {
      await result.current.create(buildRequest(leftId, rightId))
    })

    const nodes = useProjectStore.getState().nodes
    const createdId = Object.keys(nodes).find(
      id => id !== leftId && id !== rightId,
    )
    expect(createdId).toBeDefined()
    expect(nodes[createdId!].name).toBe('Combined')
    expect(mocks.finalizeCombinedTable).toHaveBeenCalledWith(
      createdId, expect.any(Number), 'guest', [leftId, rightId],
    )
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
    expect(result.current.createError).toBeUndefined()
    expect(result.current.upgradeOpen).toBe(false)
  })

  it('opens the upgrade prompt instead of creating when the table-count limit is reached', async () => {
    const ids = Array.from({ length: 5 }, (_, index) => addSource(`Table ${index}`))
    const onClose = vi.fn()
    const onDismiss = vi.fn()

    const { result } = renderHook(() => useTransformCreation({ onClose, onDismiss }))

    await act(async () => {
      await result.current.create(buildRequest(ids[0], ids[1]))
    })

    expect(Object.keys(useProjectStore.getState().nodes)).toHaveLength(5)
    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.finalizeCombinedTable).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.upgradeOpen).toBe(true))
    expect(result.current.upgradeViolation?.reason).toMatch(/5 tables/)
  })

  it('reports an OOM safety error and does not create a table when the output is unbounded', async () => {
    mocks.countCombinedTransformRows.mockResolvedValue(6_000_000)
    const leftId = addSource('Left')
    const rightId = addSource('Right')
    const onClose = vi.fn()
    const onDismiss = vi.fn()

    const { result } = renderHook(() => useTransformCreation({ onClose, onDismiss }))

    await act(async () => {
      await result.current.create(buildRequest(leftId, rightId))
    })

    expect(Object.keys(useProjectStore.getState().nodes)).toHaveLength(2)
    expect(result.current.createError).toMatch(/safety limit/)
    expect(onDismiss).not.toHaveBeenCalled()
    expect(mocks.finalizeCombinedTable).not.toHaveBeenCalled()
  })

  it('opens the upgrade prompt when a guest row limit would be exceeded', async () => {
    mocks.countCombinedTransformRows.mockResolvedValue(30_000)
    const leftId = addSource('Left')
    const rightId = addSource('Right')
    const onClose = vi.fn()
    const onDismiss = vi.fn()

    const { result } = renderHook(() => useTransformCreation({ onClose, onDismiss }))

    await act(async () => {
      await result.current.create(buildRequest(leftId, rightId))
    })

    expect(Object.keys(useProjectStore.getState().nodes)).toHaveLength(2)
    expect(onClose).toHaveBeenCalledOnce()
    await waitFor(() => expect(result.current.upgradeOpen).toBe(true))
    expect(result.current.upgradeViolation?.reason).toMatch(/30,000 rows/)
    expect(mocks.finalizeCombinedTable).not.toHaveBeenCalled()
  })

  it('does not gate row counts for the google tier', async () => {
    mocks.user = { tier: 'google' }
    mocks.countCombinedTransformRows.mockResolvedValue(400_000)
    const leftId = addSource('Left')
    const rightId = addSource('Right')
    const onDismiss = vi.fn()

    const { result } = renderHook(() => useTransformCreation({ onClose: vi.fn(), onDismiss }))

    await act(async () => {
      await result.current.create(buildRequest(leftId, rightId))
    })

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(result.current.upgradeOpen).toBe(false)
    expect(mocks.finalizeCombinedTable).toHaveBeenCalledWith(
      expect.any(String), expect.any(Number), 'google', [leftId, rightId],
    )
  })

  it('is a no-op when a create is already in flight', async () => {
    const leftId = addSource('Left')
    const rightId = addSource('Right')
    let resolveCount: (value: number) => void = () => {}
    mocks.countCombinedTransformRows.mockReturnValue(new Promise<number>((resolve) => {
      resolveCount = resolve
    }))

    const { result } = renderHook(() => useTransformCreation({ onClose: vi.fn(), onDismiss: vi.fn() }))

    let firstCreate!: Promise<void>
    act(() => {
      firstCreate = result.current.create(buildRequest(leftId, rightId))
    })
    await waitFor(() => expect(result.current.isCreating).toBe(true))

    await act(async () => {
      await result.current.create(buildRequest(leftId, rightId))
    })

    expect(mocks.countCombinedTransformRows).toHaveBeenCalledTimes(1)

    resolveCount(3)
    await act(async () => {
      await firstCreate
    })
  })
})
