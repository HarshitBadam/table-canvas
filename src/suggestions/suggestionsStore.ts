import { create } from 'zustand'
import type { Suggestion, SuggestionCategory } from '@/types'

// Context key format: tableVersionHash:columnId|table
export function createContextKey(
  tableVersionHash: string,
  columnId?: string
): string {
  return `${tableVersionHash}:${columnId ?? 'table'}`
}

export function generateTableVersionHash(
  tableId: string,
  rowCount: number,
  columnCount: number,
  updatedAt?: string
): string {
  return `${tableId}-${rowCount}-${columnCount}-${updatedAt ?? ''}`
}

interface SuggestionsState {
  activeTab: SuggestionCategory | 'all'
  selectedTableId: string | null
  selectedColumnId: string | null
  
  // Suggestions cache: contextKey -> suggestions
  suggestionsCache: Map<string, Suggestion[]>
  
  // Dismissed suggestions: contextKey -> Set of suggestion IDs
  dismissed: Map<string, Set<string>>
  
  // Consumed suggestions: globally tracked by suggestion ID
  // These persist even when source data hasn't changed (e.g., after creating a derived table)
  consumed: Set<string>
  
  isLoading: boolean
  error: string | null
  
  currentRequestId: string | null
  
  setActiveTab: (tab: SuggestionCategory | 'all') => void
  
  setSelection: (tableId: string | null, columnId?: string | null) => void
  
  setSuggestions: (contextKey: string, suggestions: Suggestion[]) => void
  getSuggestions: (contextKey: string) => Suggestion[] | undefined
  clearCache: (tableId?: string) => void
  
  dismissSuggestion: (contextKey: string, suggestionId: string) => void
  undismissSuggestion: (contextKey: string, suggestionId: string) => void
  isDismissed: (contextKey: string, suggestionId: string) => boolean
  
  consumeSuggestion: (suggestionId: string) => void
  unconsumeSuggestion: (suggestionId: string) => void
  isConsumed: (suggestionId: string) => boolean
  
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  
  setCurrentRequestId: (requestId: string | null) => void
  shouldCancelRequest: (requestId: string) => boolean
}

export const useSuggestionsStore = create<SuggestionsState>((set, get) => ({
  activeTab: 'all',
  selectedTableId: null,
  selectedColumnId: null,
  suggestionsCache: new Map(),
  dismissed: new Map(),
  consumed: new Set(),
  isLoading: false,
  error: null,
  currentRequestId: null,
  
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


