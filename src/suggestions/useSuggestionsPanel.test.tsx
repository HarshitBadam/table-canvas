import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addFilter, addSource, resetStore } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'
import { useSuggestionsStore } from './suggestionsStore'

const loadProfile = vi.hoisted(() => vi.fn())
const profile = vi.hoisted(() => ({
  tableId: 'table',
  rowCount: 5,
  phase: 1 as const,
  computedAt: new Date().toISOString(),
  columns: [{
    columnId: 'col1',
    missingCount: 0,
    missingPercent: 0,
    distinctCount: 5,
    topValues: [
      { value: 'N/A', count: 1 },
      { value: 'Alice', count: 1 },
    ],
  }],
}))

vi.mock('@/lib/profiling', () => ({
  useProfile: () => ({
    profile,
    loading: false,
    loadProfile,
  }),
}))

import { useSuggestionsPanel } from './useSuggestionsPanel'

beforeEach(() => {
  resetStore()
  loadProfile.mockReset()
  useSuggestionsStore.setState({
    activeTab: 'cleaning',
    suggestionsCache: new Map(),
    dismissed: new Map(),
    consumed: new Set(),
    isLoading: false,
    error: null,
    currentRequestId: null,
  })
})

describe('useSuggestionsPanel', () => {
  it('generates profile-backed cleaning suggestions without losing the request to rerenders', async () => {
    const tableId = addSource('Source')

    const { result } = renderHook(() => useSuggestionsPanel(tableId, undefined, true))

    await waitFor(() => {
      expect(result.current.filteredSuggestions.map(item => item.title)).toContain(
        'Convert placeholders to NULL in "ID"',
      )
    })
    expect(result.current.showLoading).toBe(false)
    expect(loadProfile).toHaveBeenCalled()
  })

  it('does not advertise unsupported cleaning suggestions for derived tables', async () => {
    const sourceId = addSource('Source')
    const tableId = addFilter(sourceId, 'Derived')
    const sourceSchema = useProjectStore.getState().getTableNode(sourceId)?.schema
    if (!sourceSchema) throw new Error('Source schema was not created')
    useProjectStore.getState().updateTableSchema(tableId, sourceSchema)

    const { result } = renderHook(() => useSuggestionsPanel(tableId, undefined, true))

    await waitFor(() => {
      expect(useSuggestionsStore.getState().suggestionsCache.size).toBeGreaterThan(0)
      expect(loadProfile).toHaveBeenCalled()
    })

    const generatedSuggestions = [...useSuggestionsStore.getState().suggestionsCache.values()].flat()
    expect(generatedSuggestions.some(item => item.category === 'cleaning')).toBe(true)
    expect(result.current.cachedSuggestions.every(item => item.category !== 'cleaning')).toBe(true)
    expect(result.current.filteredSuggestions).toEqual([])
    expect(result.current.categoryCounts.cleaning).toBe(0)
    expect(result.current.categoryCounts.all).toBe(result.current.cachedSuggestions.length)
  })
})
