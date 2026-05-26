import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import { useProfile } from '@/profiling/profiler'
import { generateSuggestions, getColumnSuggestions } from './suggestionEngine'
import { 
  useSuggestionsStore, 
  createContextKey, 
  generateTableVersionHash,
} from './suggestionsStore'
import { applySuggestion, setToastHandler, setRecipeWizardCallback, executeRecipeTransform, type ToastNotification } from './commands'
import { RecipeWizard } from './RecipeWizard'
import { CleaningPanel } from './CleaningPanel'
import { Toast } from './Toast'
import { SkeletonCard } from './SkeletonCard'
import { EmptyState } from './EmptyState'
import { SuggestionCard } from './SuggestionCard'
import type { Suggestion, TransformDef } from '@/types'

interface SuggestionsPanelProps {
  isOpen: boolean
  onClose: () => void
  tableId: string
  selectedColumnId?: string
}

export function SuggestionsPanel({ 
  isOpen, 
  onClose, 
  tableId,
  selectedColumnId,
}: SuggestionsPanelProps) {
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
  
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastNotification | null>(null)
  const [recipeWizardSuggestion, setRecipeWizardSuggestion] = useState<Suggestion | null>(null)
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastContextKeyRef = useRef<string | null>(null)
  // Track if we've seen Phase 2 stats for this profile - used to detect when Phase 2 completes
  const lastPhase2StatsSeenRef = useRef<boolean>(false)

  useEffect(() => {
    setToastHandler((notification) => {
      setToast(notification)
    })
  }, [])

  useEffect(() => {
    setRecipeWizardCallback((suggestion) => {
      setRecipeWizardSuggestion(suggestion)
    })
  }, [])

  const contextKey = useMemo(() => {
    if (!node?.schema) return null
    const versionHash = generateTableVersionHash(
      tableId,
      profile?.rowCount ?? 0,
      node.schema.columns.length,
      node.updatedAt
    )
    return createContextKey(versionHash, selectedColumnId)
  }, [tableId, node, profile, selectedColumnId])

  useEffect(() => {
    if (isOpen && tableId) {
      loadProfile()
    }
  }, [isOpen, tableId, loadProfile])

  // Check if profile has Phase 2 stats (Q1/Q3/IQR) - needed for outlier detection
  const hasPhase2Stats = useMemo(() => {
    if (!profile?.columns) return false
    return profile.columns.some(col => 
      col.q1 !== undefined || col.q3 !== undefined || col.iqr !== undefined
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

  const derivedTableCount = useMemo(() => 
    Object.values(nodes).filter(n => 
      n.kind === 'derived_table' && 
      'plan' in n && 
      n.plan?.upstreamNodeIds?.includes(tableId)
    ).length,
    [nodes, tableId]
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
        .filter((n): n is Extract<typeof n, { kind: 'derived_table' }> => 
          n.kind === 'derived_table' && 
          'plan' in n && 
          n.plan?.upstreamNodeIds?.includes(tableId)
        )
        .map(n => ({
          id: n.id,
          name: n.name,
          transformType: n.plan.transformDef.type,
          groupByColumns: 'groupByColumns' in n.plan.transformDef 
            ? (n.plan.transformDef as { groupByColumns?: string[] }).groupByColumns 
            : undefined,
        }))

      const context = {
        tableId,
        tableName: node.name,
        schema: node.schema!,
        profile: profile ? {
          columns: profile.columns,
          rowCount: profile.rowCount,
        } : undefined,
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
  }, [isOpen, node, nodes, profile, profileLoading, selectedColumnId, contextKey, getSuggestions, setSuggestions, setLoading, setCurrentRequestId, shouldCancelRequest, tableId])

  const cachedSuggestions = useMemo(() => {
    if (!contextKey) return []
    return suggestionsCache.get(contextKey) ?? []
  }, [contextKey, suggestionsCache])

  const consumed = useSuggestionsStore((state) => state.consumed)

  const filteredSuggestions = useMemo(() => {
    let suggestions = cachedSuggestions

    suggestions = suggestions.filter(s => !consumed.has(s.id))

    if (activeCategory !== 'all') {
      suggestions = suggestions.filter(s => s.category === activeCategory)
    }

    return suggestions
  }, [cachedSuggestions, activeCategory, consumed])

  const tableData = useDataStore((state) => state.tableData[tableId])
  
  const [effectiveCleaningCount, setEffectiveCleaningCount] = useState<number | null>(null)

  const isPhase2Loading = useMemo(() => {
    if (!profile || profileLoading) return false
    if (profile.phase === 1) {
      const hasNumericColumns = profile.columns.some(col => 
        col.min !== undefined || col.max !== undefined
      )
      const hasPhase2 = profile.columns.some(col => 
        col.q1 !== undefined || col.q3 !== undefined || col.iqr !== undefined
      )
      return hasNumericColumns && !hasPhase2
    }
    return false
  }, [profile, profileLoading])

  const categoryCounts = useMemo(() => {
    let cleaningCount = 0
    
    if (tableData?.rows) {
      const cleaningSuggestions = cachedSuggestions.filter(s => s.category === 'cleaning' && s.context.cleaningOperation)
      
      for (const suggestion of cleaningSuggestions) {
        const operation = suggestion.context.cleaningOperation
        const columnId = suggestion.context.columnId
        if (!operation || !columnId) continue
        
        let hasEffect = false
        for (const row of tableData.rows) {
          const value = row[columnId]
          
          if (operation.type === 'highlight_outliers') {
            if (typeof value === 'number' && (value < operation.lowerBound || value > operation.upperBound)) {
              hasEffect = true
              break
            }
          } else if (operation.type === 'trim') {
            if (value !== null && value !== undefined && String(value) !== String(value).trim()) {
              hasEffect = true
              break
            }
          } else if (operation.type === 'lowercase' || operation.type === 'uppercase' || operation.type === 'titlecase') {
            if (value !== null && value !== undefined) {
              const strValue = String(value)
              const transformed = operation.type === 'lowercase' ? strValue.toLowerCase() :
                                  operation.type === 'uppercase' ? strValue.toUpperCase() :
                                  strValue.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase())
              if (strValue !== transformed) {
                hasEffect = true
                break
              }
            }
          } else if (operation.type === 'replace_typos' || operation.type === 'normalize_case') {
            if (value !== null && value !== undefined && operation.mappings && operation.mappings[String(value)]) {
              hasEffect = true
              break
            }
          } else {
            hasEffect = true
            break
          }
        }
        
        if (hasEffect) {
          cleaningCount++
        }
      }
    } else {
      cleaningCount = cachedSuggestions.filter(s => s.category === 'cleaning').length
    }
    
    const finalCleaningCount = effectiveCleaningCount ?? cleaningCount
    
    const nonConsumed = cachedSuggestions.filter(s => !consumed.has(s.id))
    
    return {
      all: nonConsumed.length,
      cleaning: finalCleaningCount,
      analysis: nonConsumed.filter(s => s.category === 'analysis').length,
      recipe: nonConsumed.filter(s => s.category === 'recipe').length,
    }
  }, [cachedSuggestions, tableData?.rows, effectiveCleaningCount, consumed])

  const handleApply = useCallback(async (suggestion: Suggestion) => {
    setApplyingId(suggestion.id)
    try {
      await applySuggestion(suggestion)
    } catch (error) {
      console.error('Failed to apply suggestion:', error)
    } finally {
      setApplyingId(null)
    }
  }, [])

  const showLoading = isLoading || profileLoading

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-y-0 right-0 w-96 bg-surface border-l border-border shadow-xl z-50 flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Suggestions</h2>
            <p className="text-xs text-text-tertiary">
              {selectedColumnId 
                ? 'For selected column'
                : `For this table`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
            aria-label="Close suggestions panel"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 px-4 py-2 border-b border-border bg-surface-secondary/50">
          {(['all', 'cleaning', 'analysis', 'recipe'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
                ${activeCategory === cat
                  ? 'bg-accent-green text-white shadow-sm'
                  : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                }
              `}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              <span className={`ml-1 ${activeCategory === cat ? 'opacity-80' : 'opacity-60'}`}>
                ({categoryCounts[cat]}{cat === 'cleaning' && isPhase2Loading ? '+' : ''})
              </span>
              {cat === 'cleaning' && isPhase2Loading && (
                <span className="ml-1 text-[10px] opacity-50" title="More suggestions may appear as analysis completes">
                  ⏳
                </span>
              )}
            </button>
          ))}
        </div>

        {activeCategory === 'cleaning' ? (
          <CleaningPanel
            suggestions={cachedSuggestions}
            tableId={tableId}
            onComplete={() => {
              onClose()
            }}
            onCountChange={setEffectiveCleaningCount}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {showLoading && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCard key={i} delay={i * 50} />
                ))}
              </div>
            )}

            {!showLoading && filteredSuggestions.length === 0 && (
              <EmptyState 
                hasColumn={!!selectedColumnId}
                hasTable={!!node}
                category={activeCategory === 'all' ? undefined : activeCategory}
              />
            )}

            {!showLoading && filteredSuggestions.map((suggestion, index) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                isExpanded={expandedId === suggestion.id}
                isApplying={applyingId === suggestion.id}
                animationDelay={index * 50}
                onToggle={() => setExpandedId(
                  expandedId === suggestion.id ? null : suggestion.id
                )}
                onApply={() => handleApply(suggestion)}
              />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <Toast 
          notification={toast} 
          onDismiss={() => setToast(null)} 
        />
      )}

      <RecipeWizard
        isOpen={recipeWizardSuggestion !== null}
        onClose={() => setRecipeWizardSuggestion(null)}
        suggestion={recipeWizardSuggestion}
        onExecute={async (transform: TransformDef, tableName: string) => {
          if (recipeWizardSuggestion) {
            const sourceTableId = recipeWizardSuggestion.context.tableId
            const result = await executeRecipeTransform(transform, tableName, sourceTableId)
            if (result.success) {
              useSuggestionsStore.getState().consumeSuggestion(recipeWizardSuggestion.id)
            }
          }
        }}
      />
    </>
  )
}
