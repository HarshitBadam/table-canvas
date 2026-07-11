import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Suggestion } from '@/types'
import { addFilter, addSource, clean, resetStore } from '@/engine/integrationTestUtils'
import { useDataStore, type TableRow } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'
import { useSuggestionsStore } from './suggestionsStore'

const loadProfileForTable = vi.hoisted(() => vi.fn())
const clearAndStartLoading = vi.hoisted(() => vi.fn())
const showToast = vi.hoisted(() => vi.fn())

vi.mock('@/lib/profiling', () => ({
  loadProfileForTable,
  useProfilingStore: {
    getState: () => ({ clearAndStartLoading }),
  },
}))
vi.mock('./commands/types', () => ({ showToast }))

import { useCleaningApply } from './useCleaningApply'

function trimSuggestion(tableId: string): Suggestion {
  return {
    id: 'trim-value',
    category: 'cleaning',
    scope: 'column',
    title: 'Trim whitespace',
    confidence: 'high',
    context: {
      tableId,
      columnId: 'col1',
      tableVersionHash: 'version',
      cleaningOperation: { type: 'trim' },
    },
    action: {
      kind: 'applyPatch',
      ops: [],
      target: 'source',
    },
  }
}

beforeEach(() => {
  resetStore()
  useDataStore.setState({ tableData: {} })
  useSuggestionsStore.setState({
    suggestionsCache: new Map(),
    dismissed: new Map(),
    consumed: new Set(),
  })
  loadProfileForTable.mockReset().mockResolvedValue(undefined)
  clearAndStartLoading.mockReset()
  showToast.mockReset()
})

describe('useCleaningApply', () => {
  it('persists combined changes, dirties descendants, refreshes profiling, and clears selection', async () => {
    const tableId = addSource('Source')
    const derivedId = addFilter(tableId, 'Filtered')
    clean(tableId, derivedId)
    const rows: TableRow[] = [
      { __rowId: 'row-1', col1: '  Alpha  ', col2: 1 },
      { __rowId: 'row-2', col1: 'Beta', col2: 2 },
    ]
    const suggestion = trimSuggestion(tableId)
    const setSelectedIds = vi.fn()
    useSuggestionsStore.setState({
      suggestionsCache: new Map([
        [`${tableId}-2-2-version:table`, [suggestion]],
        ['other-table-1-1-version:table', [suggestion]],
      ]),
    })

    const { result } = renderHook(() => useCleaningApply({
      suggestionsWithEffects: [{ suggestion }],
      selectedIds: new Set([suggestion.id]),
      tableId,
      setSelectedIds,
      rows,
    }))

    await act(async () => {
      await result.current.handleApply()
    })

    expect(useDataStore.getState().tableData[tableId].rows[0].col1).toBe('Alpha')
    expect(useProjectStore.getState().patches[tableId].cellPatches.col1['row-1']).toBe('Alpha')
    expect(useProjectStore.getState().getTableNode(tableId)?.cacheInfo?.isDirty).toBe(true)
    expect(useProjectStore.getState().getTableNode(derivedId)?.cacheInfo?.isDirty).toBe(true)
    expect(useProjectStore.getState().history.past.at(-1)?.description).toBe(
      'Apply cleaning operations',
    )
    expect(clearAndStartLoading).toHaveBeenCalledWith(tableId)
    expect(loadProfileForTable).toHaveBeenCalledWith(tableId, true)
    expect([...useSuggestionsStore.getState().suggestionsCache.keys()]).toEqual([
      'other-table-1-1-version:table',
    ])
    expect(setSelectedIds).toHaveBeenCalledOnce()
    expect(setSelectedIds.mock.calls[0][0](new Set([suggestion.id]))).toEqual(new Set())
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      message: 'Applied 1 cell change',
    }))
  })

  it('does nothing when no suggestions are selected', async () => {
    const tableId = addSource('Source')
    const rows: TableRow[] = [{ __rowId: 'row-1', col1: '  Alpha  ' }]
    const suggestion = trimSuggestion(tableId)

    const { result } = renderHook(() => useCleaningApply({
      suggestionsWithEffects: [{ suggestion }],
      selectedIds: new Set(),
      tableId,
      setSelectedIds: vi.fn(),
      rows,
    }))

    await act(async () => {
      await result.current.handleApply()
    })

    expect(useProjectStore.getState().patches[tableId]?.cellPatches).toEqual({})
    expect(loadProfileForTable).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })
})
