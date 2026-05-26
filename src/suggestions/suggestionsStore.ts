/**
 * Suggestions Store
 * Manages suggestion state with caching, debouncing, and cancellation
 */

import { create } from 'zustand'
import type { Suggestion, SuggestionCategory } from '@/types'

// Context key format: tableVersionHash:columnId|table
export function createContextKey(
  tableVersionHash: string,
  columnId?: string
): string {
  return `${tableVersionHash}:${columnId ?? 'table'}`
}

// Generate a simple hash from table data for cache invalidation
export function generateTableVersionHash(
  tableId: string,
  rowCount: number,
  columnCount: number,
  updatedAt?: string
): string {
  return `${tableId}-${rowCount}-${columnCount}-${updatedAt ?? ''}`
}

interface SuggestionsState {
  // Panel UI state
  isOpen: boolean
  activeTab: SuggestionCategory | 'all'
  
  // Selection context
  selectedTableId: string | null
  selectedColumnId: string | null
  
  // Suggestions cache: contextKey -> suggestions
  suggestionsCache: Map<string, Suggestion[]>
  
  // Dismissed suggestions: contextKey -> Set of suggestion IDs
  dismissed: Map<string, Set<string>>
  
  // Consumed suggestions: globally tracked by suggestion ID
  // These persist even when source data hasn't changed (e.g., after creating a derived table)
  consumed: Set<string>
  
  // Loading state
  isLoading: boolean
  error: string | null
  
  // Current request for cancellation
  currentRequestId: string | null
  
  // Actions
  setOpen: (isOpen: boolean) => void
  toggleOpen: () => void
  setActiveTab: (tab: SuggestionCategory | 'all') => void
  
  setSelection: (tableId: string | null, columnId?: string | null) => void
  
  setSuggestions: (contextKey: string, suggestions: Suggestion[]) => void
  getSuggestions: (contextKey: string) => Suggestion[] | undefined
  clearCache: (tableId?: string) => void
  
  dismissSuggestion: (contextKey: string, suggestionId: string) => void
  undismissSuggestion: (contextKey: string, suggestionId: string) => void
  isDismissed: (contextKey: string, suggestionId: string) => boolean
  
  // Consumed suggestion actions (for recipes/analysis that create derived tables)
  consumeSuggestion: (suggestionId: string) => void
  unconsumeSuggestion: (suggestionId: string) => void
  isConsumed: (suggestionId: string) => boolean
  
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  
  setCurrentRequestId: (requestId: string | null) => void
  shouldCancelRequest: (requestId: string) => boolean
}

export const useSuggestionsStore = create<SuggestionsState>((set, get) => ({
  isOpen: false,
  activeTab: 'all',
  selectedTableId: null,
  selectedColumnId: null,
  suggestionsCache: new Map(),
  dismissed: new Map(),
  consumed: new Set(),
  isLoading: false,
  error: null,
  currentRequestId: null,
  
  setOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  setSelection: (tableId, columnId) => set({
    selectedTableId: tableId,
    selectedColumnId: columnId ?? null,
    error: null,
  }),
  
  setSuggestions: (contextKey, suggestions) => {
    set((state) => {
      const newCache = new Map(state.suggestionsCache)
      newCache.set(contextKey, suggestions)
      return { suggestionsCache: newCache, isLoading: false, error: null }
    })
  },
  
  getSuggestions: (contextKey) => {
    return get().suggestionsCache.get(contextKey)
  },
  
  clearCache: (tableId) => {
    set((state) => {
      if (!tableId) {
        return { suggestionsCache: new Map() }
      }
      
      // Clear entries that contain this tableId
      const newCache = new Map(state.suggestionsCache)
      for (const key of newCache.keys()) {
        if (key.includes(tableId)) {
          newCache.delete(key)
        }
      }
      return { suggestionsCache: newCache }
    })
  },
  
  dismissSuggestion: (contextKey, suggestionId) => {
    set((state) => {
      const newDismissed = new Map(state.dismissed)
      const dismissedSet = newDismissed.get(contextKey) ?? new Set()
      dismissedSet.add(suggestionId)
      newDismissed.set(contextKey, dismissedSet)
      return { dismissed: newDismissed }
    })
  },
  
  undismissSuggestion: (contextKey, suggestionId) => {
    set((state) => {
      const newDismissed = new Map(state.dismissed)
      const dismissedSet = newDismissed.get(contextKey)
      if (dismissedSet) {
        dismissedSet.delete(suggestionId)
        newDismissed.set(contextKey, dismissedSet)
      }
      return { dismissed: newDismissed }
    })
  },
  
  isDismissed: (contextKey, suggestionId) => {
    return get().dismissed.get(contextKey)?.has(suggestionId) ?? false
  },
  
  consumeSuggestion: (suggestionId) => {
    set((state) => {
      const newConsumed = new Set(state.consumed)
      newConsumed.add(suggestionId)
      return { consumed: newConsumed }
    })
  },
  
  unconsumeSuggestion: (suggestionId) => {
    set((state) => {
      const newConsumed = new Set(state.consumed)
      newConsumed.delete(suggestionId)
      return { consumed: newConsumed }
    })
  },
  
  isConsumed: (suggestionId) => {
    return get().consumed.has(suggestionId)
  },
  
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  
  setCurrentRequestId: (requestId) => set({ currentRequestId: requestId }),
  shouldCancelRequest: (requestId) => {
    return get().currentRequestId !== requestId
  },
}))

let debounceTimeout: ReturnType<typeof setTimeout> | null = null

export function debouncedSetSelection(
  tableId: string | null,
  columnId?: string | null,
  delay = 100
): void {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
  }
  
  debounceTimeout = setTimeout(() => {
    useSuggestionsStore.getState().setSelection(tableId, columnId)
    debounceTimeout = null
  }, delay)
}

export function useFilteredSuggestions(contextKey: string): Suggestion[] {
  const suggestions = useSuggestionsStore((state) => 
    state.suggestionsCache.get(contextKey) ?? []
  )
  const dismissed = useSuggestionsStore((state) => 
    state.dismissed.get(contextKey) ?? new Set()
  )
  const consumed = useSuggestionsStore((state) => state.consumed)
  const activeTab = useSuggestionsStore((state) => state.activeTab)
  
  return suggestions.filter((s) => {
    if (dismissed.has(s.id)) return false
    if (consumed.has(s.id)) return false
    if (activeTab !== 'all' && s.category !== activeTab) return false
    
    return true
  })
}

export function useCategoryCounts(contextKey: string): Record<SuggestionCategory | 'all', number> {
  const suggestions = useSuggestionsStore((state) => 
    state.suggestionsCache.get(contextKey) ?? []
  )
  const dismissed = useSuggestionsStore((state) => 
    state.dismissed.get(contextKey) ?? new Set()
  )
  const consumed = useSuggestionsStore((state) => state.consumed)
  
  const filtered = suggestions.filter((s) => !dismissed.has(s.id) && !consumed.has(s.id))
  
  return {
    all: filtered.length,
    cleaning: filtered.filter((s) => s.category === 'cleaning').length,
    analysis: filtered.filter((s) => s.category === 'analysis').length,
    recipe: filtered.filter((s) => s.category === 'recipe').length,
  }
}

