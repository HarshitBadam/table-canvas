import { useState, useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useProfile } from '@/lib/profiling'
import { generateSuggestions, getColumnSuggestions } from './engine'
import {
  useSuggestionsStore,
  createContextKey,
  generateTableVersionHash,
} from './suggestionsStore'
import { useCategoryCounts } from './useCategoryCounts'
import { getExistingDerivedTables } from './derivedTableContext'
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
  error: string | null
  retry: () => void
  dismissedCount: number
  dismissSuggestion: (suggestionId: string) => void
  restoreDismissed: () => void
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
  const suggestionsCache = useSuggestionsStore((state) => state.suggestionsCache)
  const setLoading = useSuggestionsStore((state) => state.setLoading)
  const isLoading = useSuggestionsStore((state) => state.isLoading)
  const error = useSuggestionsStore((state) => state.error)
  const setError = useSuggestionsStore((state) => state.setError)
  const consumed = useSuggestionsStore((state) => state.consumed)
  const dismissed = useSuggestionsStore((state) => state.dismissed)
  const dismissSuggestion = useSuggestionsStore((state) => state.dismissSuggestion)
  const undismissSuggestion = useSuggestionsStore((state) => state.undismissSuggestion)

  const [effectiveCleaningCount, setEffectiveCleaningCount] = useState<number | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const lastContextKeyRef = useRef<string | null>(null)
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
    if (isOpen && tableId && !profileLoading) {
      loadProfile()
    }
  }, [isOpen, tableId, profileLoading, loadProfile])

  const hasPhase2Stats = useMemo(() => {
    if (!profile?.columns) return false
    return profile.columns.some(
      (col) => col.q1 !== undefined || col.q3 !== undefined || col.iqr !== undefined,
    )
  }, [profile])

  useEffect(() => {
    if (!contextKey || !isOpen) return

    if (contextKey !== lastContextKeyRef.current) {
      lastPhase2StatsSeenRef.current = false
      lastContextKeyRef.current = contextKey
    }

    const cached = getSuggestions(contextKey)
    const hadPhase2Before = lastPhase2StatsSeenRef.current
    const hasPhase2Now = hasPhase2Stats

    if (cached !== undefined && !hadPhase2Before && hasPhase2Now) {
      clearCache(tableId)
      lastPhase2StatsSeenRef.current = true
    } else if (hasPhase2Now) {
      lastPhase2StatsSeenRef.current = true
    }
  }, [contextKey, isOpen, hasPhase2Stats, getSuggestions, clearCache, tableId])

  const existingDerivedTables = useMemo(
    () => getExistingDerivedTables(Object.values(nodes), tableId),
    [nodes, tableId],
  )
  const derivedTableCount = existingDerivedTables.length
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

    setLoading(true)
    setError(null)

    try {
      const context = {
        tableId,
        tableName: node.name,
        schema: node.schema,
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
      setSuggestions(contextKey, newSuggestions)
      lastContextKeyRef.current = contextKey
      lastPhase2StatsSeenRef.current = hasPhase2Stats
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Suggestion analysis failed'
      setError(message)
    }
  }, [
    isOpen,
    node,
    existingDerivedTables,
    profile,
    profileLoading,
    selectedColumnId,
    contextKey,
    getSuggestions,
    setSuggestions,
    setLoading,
    tableId,
    hasPhase2Stats,
    retryNonce,
    setError,
  ])

  const cachedSuggestions = useMemo(() => {
    if (!contextKey) return []
    const suggestions = suggestionsCache.get(contextKey) ?? []
    if (node?.kind === 'source_table') return suggestions

    // Cleaning applies patches to editable source rows. Derived tables are
    // view-only, so do not advertise cleaning actions that cannot be opened.
    return suggestions.filter((suggestion) => suggestion.category !== 'cleaning')
  }, [contextKey, suggestionsCache, node?.kind])

  const filteredSuggestions = useMemo(() => {
    let suggestions = cachedSuggestions

    suggestions = suggestions.filter((s) => !consumed.has(s.id))
    const dismissedForContext = contextKey ? dismissed.get(contextKey) : undefined
    suggestions = suggestions.filter((s) => !dismissedForContext?.has(s.id))

    if (activeCategory !== 'all') {
      suggestions = suggestions.filter((s) => s.category === activeCategory)
    }

    return suggestions
  }, [cachedSuggestions, activeCategory, consumed, contextKey, dismissed])

  const dismissedIds = useMemo(
    () => contextKey ? dismissed.get(contextKey) ?? new Set<string>() : new Set<string>(),
    [contextKey, dismissed],
  )

  const isPhase2Loading = useMemo(() => {
    if (!profile || profileLoading) return false
    if (profile.phase === 1) {
      return node?.schema?.columns.some((column) => column.type === 'number') ?? false
    }
    return false
  }, [profile, profileLoading, node])

  const categoryCounts = useCategoryCounts(
    cachedSuggestions,
    tableId,
    effectiveCleaningCount,
    dismissedIds,
  )

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
    error,
    retry: () => {
      if (contextKey) clearCache(tableId)
      setRetryNonce((value) => value + 1)
    },
    dismissedCount: dismissedIds.size,
    dismissSuggestion: (suggestionId) => {
      if (contextKey) dismissSuggestion(contextKey, suggestionId)
    },
    restoreDismissed: () => {
      if (!contextKey) return
      for (const suggestionId of dismissedIds) {
        undismissSuggestion(contextKey, suggestionId)
      }
    },
    setEffectiveCleaningCount,
  }
}
