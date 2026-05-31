import { useState, useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useProfile } from '@/profiling'
import { generateSuggestions, getColumnSuggestions } from './engine'
import {
  useSuggestionsStore,
  createContextKey,
  generateTableVersionHash,
} from './suggestionsStore'
import { useCategoryCounts } from './useCategoryCounts'
import type { Suggestion, SuggestionCategory, TableNode } from '@/types'

interface SuggestionsPanelHookResult {
  node: TableNode | undefined
  cachedSuggestions: Suggestion[]
  filteredSuggestions: Suggestion[]
  showLoading: boolean
  activeCategory: SuggestionCategory | 'all'
  setActiveCategory: (tab: SuggestionCategory | 'all') => void
  categoryCounts: { all: number; cleaning: number; analysis: number; recipe: number }
  isPhase2Loading: boolean
  setEffectiveCleaningCount: (count: number | null) => void
}

export function useSuggestionsPanel(
  tableId: string,
  selectedColumnId?: string,
  isOpen?: boolean,
): SuggestionsPanelHookResult {
  const node = useProjectStore((state) => state.getTableNode(tableId))
  const nodes = useProjectStore((state) => state.nodes)
  const { profile, loading: profileLoading, loadProfile } = useProfile(tableId)

  const activeCategory = useSuggestionsStore((state) => state.activeTab)
  const setActiveCategory = useSuggestionsStore((state) => state.setActiveTab)
  const setSuggestions = useSuggestionsStore((state) => state.setSuggestions)
  const getSuggestions = useSuggestionsStore((state) => state.getSuggestions)
  const clearCache = useSuggestionsStore((state) => state.clearCache)
  // Subscribe to the entire cache so we re-render when it changes
  const suggestionsCache = useSuggestionsStore((state) => state.suggestionsCache)
  const setLoading = useSuggestionsStore((state) => state.setLoading)
  const isLoading = useSuggestionsStore((state) => state.isLoading)
  const setCurrentRequestId = useSuggestionsStore((state) => state.setCurrentRequestId)
  const shouldCancelRequest = useSuggestionsStore((state) => state.shouldCancelRequest)
  const consumed = useSuggestionsStore((state) => state.consumed)

  const [effectiveCleaningCount, setEffectiveCleaningCount] = useState<number | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastContextKeyRef = useRef<string | null>(null)
  // Track if we've seen Phase 2 stats for this profile - used to detect when Phase 2 completes
  const lastPhase2StatsSeenRef = useRef<boolean>(false)

  const contextKey = useMemo(() => {
    if (!node?.schema) return null
    const versionHash = generateTableVersionHash(
      tableId,
      profile?.rowCount ?? 0,
      node.schema.columns.length,
      node.updatedAt,
    )
    return createContextKey(versionHash, selectedColumnId)
  }, [tableId, node, profile, selectedColumnId])

  useEffect(() => {
    if (isOpen && tableId) {
      loadProfile()
    }
  }, [isOpen, tableId, loadProfile])

  const hasPhase2Stats = useMemo(() => {
    if (!profile?.columns) return false
    return profile.columns.some(
      (col) => col.q1 !== undefined || col.q3 !== undefined || col.iqr !== undefined,
    )
  }, [profile])

  // Clear cache when Phase 2 stats become available so suggestions regenerate with outlier data
  useEffect(() => {
    if (!contextKey || !isOpen) return

    if (contextKey !== lastContextKeyRef.current) {
      lastPhase2StatsSeenRef.current = false
      lastContextKeyRef.current = contextKey
    }

    const cached = getSuggestions(contextKey)
    const hadPhase2Before = lastPhase2StatsSeenRef.current
    const hasPhase2Now = hasPhase2Stats

    if (cached && cached.length > 0 && !hadPhase2Before && hasPhase2Now) {
      clearCache(tableId)
      lastPhase2StatsSeenRef.current = true
    } else if (hasPhase2Now) {
      lastPhase2StatsSeenRef.current = true
    }
  }, [contextKey, isOpen, hasPhase2Stats, getSuggestions, clearCache, tableId])

  const derivedTableCount = useMemo(
    () =>
      Object.values(nodes).filter(
        (n) =>
          n.kind === 'derived_table' &&
          'plan' in n &&
          n.plan?.upstreamNodeIds?.includes(tableId),
      ).length,
    [nodes, tableId],
  )
  const lastDerivedCountRef = useRef(derivedTableCount)

  useEffect(() => {
    if (derivedTableCount !== lastDerivedCountRef.current) {
      clearCache(tableId)
      lastDerivedCountRef.current = derivedTableCount
    }
  }, [derivedTableCount, clearCache, tableId])

  useEffect(() => {
    if (!isOpen || !node?.schema || !contextKey) return

    if (profileLoading) {
      return
    }

    const cached = getSuggestions(contextKey)
    if (cached && cached.length > 0) {
      lastContextKeyRef.current = contextKey
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    const requestId = `${Date.now()}-${Math.random()}`
    setCurrentRequestId(requestId)
    setLoading(true)

    debounceRef.current = setTimeout(() => {
      if (shouldCancelRequest(requestId)) {
        return
      }

      const existingDerivedTables = Object.values(nodes)
        .filter(
          (n): n is Extract<typeof n, { kind: 'derived_table' }> =>
            n.kind === 'derived_table' &&
            'plan' in n &&
            n.plan?.upstreamNodeIds?.includes(tableId),
        )
        .map((n) => ({
          id: n.id,
          name: n.name,
          transformType: n.plan.transformDef.type,
          groupByColumns:
            'groupByColumns' in n.plan.transformDef
              ? (n.plan.transformDef as { groupByColumns?: string[] }).groupByColumns
              : undefined,
        }))

      const context = {
        tableId,
        tableName: node.name,
        schema: node.schema!,
        profile: profile
          ? {
              columns: profile.columns,
              rowCount: profile.rowCount,
            }
          : undefined,
        selectedColumnId,
        tableVersionHash: contextKey.split(':')[0],
        existingDerivedTables,
      }

      const newSuggestions = selectedColumnId
        ? getColumnSuggestions(context)
        : generateSuggestions(context)

      if (!shouldCancelRequest(requestId)) {
        setSuggestions(contextKey, newSuggestions)
        lastContextKeyRef.current = contextKey
        lastPhase2StatsSeenRef.current = hasPhase2Stats
      }
    }, 100)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [
    isOpen,
    node,
    nodes,
    profile,
    profileLoading,
    selectedColumnId,
    contextKey,
    getSuggestions,
    setSuggestions,
    setLoading,
    setCurrentRequestId,
    shouldCancelRequest,
    tableId,
  ])

  const cachedSuggestions = useMemo(() => {
    if (!contextKey) return []
    return suggestionsCache.get(contextKey) ?? []
  }, [contextKey, suggestionsCache])

  const filteredSuggestions = useMemo(() => {
    let suggestions = cachedSuggestions

    suggestions = suggestions.filter((s) => !consumed.has(s.id))

    if (activeCategory !== 'all') {
      suggestions = suggestions.filter((s) => s.category === activeCategory)
    }

    return suggestions
  }, [cachedSuggestions, activeCategory, consumed])

  const isPhase2Loading = useMemo(() => {
    if (!profile || profileLoading) return false
    if (profile.phase === 1) {
      const hasNumericColumns = profile.columns.some(
        (col) => col.min !== undefined || col.max !== undefined,
      )
      const hasPhase2 = profile.columns.some(
        (col) => col.q1 !== undefined || col.q3 !== undefined || col.iqr !== undefined,
      )
      return hasNumericColumns && !hasPhase2
    }
    return false
  }, [profile, profileLoading])

  const categoryCounts = useCategoryCounts(cachedSuggestions, tableId, effectiveCleaningCount)

  const showLoading = isLoading || profileLoading

  return {
    node,
    cachedSuggestions,
    filteredSuggestions,
    showLoading,
    activeCategory,
    setActiveCategory,
    categoryCounts,
    isPhase2Loading,
    setEffectiveCleaningCount,
  }
}
