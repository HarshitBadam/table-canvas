import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addFilter, addSource, resetStore } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'
import { getNodeCacheInfo, updateNodeCacheInfo } from '@/state/tableRuntimeStore'
import type { DuplicateDerivedTableResult } from '@/state/project/duplicateDerivedTable'
import { useSidebarNodeDuplication } from '@/layout/navigation/useSidebarNodeDuplication'

const mocks = vi.hoisted(() => ({
  duplicateDerivedTable: vi.fn(),
  continuePendingSourceDuplicate: vi.fn(),
}))

vi.mock('@/state/project/duplicateDerivedTable', () => ({
  duplicateDerivedTable: mocks.duplicateDerivedTable,
}))
vi.mock('@/state/project/continuePendingSourceDuplicate', () => ({
  continuePendingSourceDuplicate: mocks.continuePendingSourceDuplicate,
}))

let authUser: { tier: 'guest' | 'google' } | null = { tier: 'google' }
vi.mock('@/state/AppContext', () => ({
  useAppAuth: () => ({ user: authUser }),
}))

beforeEach(() => {
  resetStore()
  authUser = { tier: 'google' }
  mocks.duplicateDerivedTable.mockReset()
  mocks.continuePendingSourceDuplicate.mockReset().mockResolvedValue(undefined)
})

describe('useSidebarNodeDuplication', () => {
  it('duplicates a non-table node directly without a limit check', () => {
    const sourceId = addSource('Source')
    const chartId = useProjectStore.getState().addChart({
      name: 'Chart',
      plan: {
        sourceTableId: sourceId,
        chartType: 'bar',
        config: { xAxis: 'col1', yAxis: 'col2' },
      },
      position: { x: 0, y: 0 },
    })
    const node = useProjectStore.getState().nodes[chartId]

    const { result } = renderHook(() => useSidebarNodeDuplication(node))

    act(() => {
      void result.current.duplicate()
    })

    const nodeCount = Object.values(useProjectStore.getState().nodes).length
    expect(nodeCount).toBe(3)
    expect(result.current.upgradeOpen).toBe(false)
  })

  it('duplicates a settled source table without continuing a pending import', async () => {
    const sourceId = addSource('Source')
    const node = useProjectStore.getState().nodes[sourceId]

    const { result } = renderHook(() => useSidebarNodeDuplication(node))

    await act(async () => {
      await result.current.duplicate()
    })

    expect(mocks.continuePendingSourceDuplicate).not.toHaveBeenCalled()
  })

  it('continues a pending source duplicate when the original is still waiting', async () => {
    const sourceId = addSource('Source')
    updateNodeCacheInfo(sourceId, { phase: 'waiting' })
    const node = useProjectStore.getState().nodes[sourceId]

    const { result } = renderHook(() => useSidebarNodeDuplication(node))

    await act(async () => {
      await result.current.duplicate()
    })

    expect(mocks.continuePendingSourceDuplicate).toHaveBeenCalledTimes(1)
    const [continuedSourceId, duplicateId] = mocks.continuePendingSourceDuplicate.mock.calls[0]
    expect(continuedSourceId).toBe(sourceId)
    expect(duplicateId).not.toBe(sourceId)
    expect(getNodeCacheInfo(duplicateId)?.phase).toBe('waiting')
  })

  it('blocks duplication and opens the upgrade prompt once the table limit is reached', () => {
    authUser = { tier: 'guest' }
    let lastSourceId = ''
    for (let i = 0; i < 5; i += 1) lastSourceId = addSource(`Source ${i}`)
    const node = useProjectStore.getState().nodes[lastSourceId]
    const nodeCountBefore = Object.keys(useProjectStore.getState().nodes).length

    const { result } = renderHook(() => useSidebarNodeDuplication(node))

    act(() => {
      void result.current.duplicate()
    })

    expect(result.current.upgradeOpen).toBe(true)
    expect(result.current.upgradeViolation).not.toBeNull()
    expect(Object.keys(useProjectStore.getState().nodes)).toHaveLength(nodeCountBefore)
  })

  it('locks re-entrant derived-table duplication while one is already in flight', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Derived')
    const node = useProjectStore.getState().nodes[derivedId]
    let resolveDuplicate: (result: DuplicateDerivedTableResult) => void = () => {}
    mocks.duplicateDerivedTable.mockReturnValue(
      new Promise<DuplicateDerivedTableResult>(resolve => { resolveDuplicate = resolve }),
    )

    const { result } = renderHook(() => useSidebarNodeDuplication(node))

    let firstCall!: Promise<void>
    act(() => {
      firstCall = result.current.duplicate()
    })
    expect(result.current.duplicating).toBe(true)

    await act(async () => {
      await result.current.duplicate()
    })
    expect(mocks.duplicateDerivedTable).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDuplicate({ ok: true, tableId: 'new-derived-id' })
      await firstCall
    })
    expect(result.current.duplicating).toBe(false)
  })

  it('surfaces a LIMIT_EXCEEDED derived-table failure as an upgrade prompt', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Derived')
    const node = useProjectStore.getState().nodes[derivedId]
    mocks.duplicateDerivedTable.mockResolvedValue({
      ok: false,
      code: 'LIMIT_EXCEEDED',
      error: 'This project already has 5 tables (limit: 5)',
      violation: { ok: false, reason: 'This project already has 5 tables (limit: 5)', limit: 5, tier: 'guest' },
    } satisfies DuplicateDerivedTableResult)

    const { result } = renderHook(() => useSidebarNodeDuplication(node))

    await act(async () => {
      await result.current.duplicate()
    })

    expect(result.current.upgradeOpen).toBe(true)
    expect(result.current.duplicateError).toBeNull()
  })

  it('surfaces other derived-table failures as a duplicate error, clearable afterward', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Derived')
    const node = useProjectStore.getState().nodes[derivedId]
    mocks.duplicateDerivedTable.mockResolvedValue({
      ok: false,
      code: 'MATERIALIZATION_FAILED',
      error: 'The derived table schema is unavailable.',
    } satisfies DuplicateDerivedTableResult)

    const { result } = renderHook(() => useSidebarNodeDuplication(node))

    await act(async () => {
      await result.current.duplicate()
    })

    expect(result.current.duplicateError).toBe('The derived table schema is unavailable.')
    expect(result.current.upgradeOpen).toBe(false)

    act(() => {
      result.current.clearDuplicateError()
    })
    expect(result.current.duplicateError).toBeNull()
  })
})
