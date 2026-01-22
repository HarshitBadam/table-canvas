/**
 * Suggestions Panel Component
 * Displays context-aware suggestions in a slide-out drawer
 */

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
import type { Suggestion, SuggestionCategory, SuggestionConfidence, TransformDef } from '@/lib/types'

interface SuggestionsPanelProps {
  isOpen: boolean
  onClose: () => void
  tableId: string
  selectedColumnId?: string
}

// Toast component for notifications
function Toast({ notification, onDismiss }: { 
  notification: ToastNotification
  onDismiss: () => void 
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const bgColor = notification.type === 'success' ? 'bg-green-600' :
                  notification.type === 'error' ? 'bg-red-600' : 'bg-green-600'

  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-[100] flex items-center gap-3 animate-slide-up`}>
      <span className="text-sm">{notification.message}</span>
      {notification.action && (
        <button
          onClick={() => {
            notification.action?.onClick()
            onDismiss()
          }}
          className="text-sm font-medium underline hover:no-underline"
        >
          {notification.action.label}
        </button>
      )}
      <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
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
  
  // Store state
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
  
  // Local state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastNotification | null>(null)
  const [recipeWizardSuggestion, setRecipeWizardSuggestion] = useState<Suggestion | null>(null)
  
  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastContextKeyRef = useRef<string | null>(null)
  // Track if we've seen Phase 2 stats for this profile - used to detect when Phase 2 completes
  const lastPhase2StatsSeenRef = useRef<boolean>(false)

  // Set up toast handler
  useEffect(() => {
    setToastHandler((notification) => {
      setToast(notification)
    })
  }, [])

  // Set up recipe wizard callback
  useEffect(() => {
    setRecipeWizardCallback((suggestion) => {
      setRecipeWizardSuggestion(suggestion)
    })
  }, [])

  // Generate context key for caching
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

  // Load profile when panel opens
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


  // Detect when Phase 2 stats become available and clear cache to regenerate suggestions
  useEffect(() => {
    if (!contextKey || !isOpen) return
    
    // Reset tracking when context key changes (new table/version)
    if (contextKey !== lastContextKeyRef.current) {
      lastPhase2StatsSeenRef.current = false
      lastContextKeyRef.current = contextKey
    }
    
    // If Phase 2 stats just became available (we have cached suggestions but Phase 2 stats are new)
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

  // Track derived table count to clear cache when new derived tables are created
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

  // Generate suggestions with debouncing
  useEffect(() => {
    if (!isOpen || !node?.schema || !contextKey) return
    
    // Don't generate while profile is still loading
    if (profileLoading) {
      return
    }

    // Check cache first - but only use cache if it has suggestions
    // An empty cache might mean we generated before profile loaded
    const cached = getSuggestions(contextKey)
    if (cached && cached.length > 0) {
      lastContextKeyRef.current = contextKey
      return
    }

    // Debounce for 100ms
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    const requestId = `${Date.now()}-${Math.random()}`
    setCurrentRequestId(requestId)
    setLoading(true)

    debounceRef.current = setTimeout(() => {
      // Check if request was cancelled
      if (shouldCancelRequest(requestId)) {
        return
      }

      // Find existing derived tables that use this table as a source
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

      // Check again before setting
      if (!shouldCancelRequest(requestId)) {
        setSuggestions(contextKey, newSuggestions)
        lastContextKeyRef.current = contextKey
        // Track that we've generated with current Phase 2 state
        lastPhase2StatsSeenRef.current = hasPhase2Stats
      }
    }, 100)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [isOpen, node, nodes, profile, profileLoading, selectedColumnId, contextKey, getSuggestions, setSuggestions, setLoading, setCurrentRequestId, shouldCancelRequest, tableId])

  // Get suggestions from cache - depend on suggestionsCache to trigger re-render
  const cachedSuggestions = useMemo(() => {
    if (!contextKey) return []
    return suggestionsCache.get(contextKey) ?? []
  }, [contextKey, suggestionsCache])

  // Get consumed suggestions set
  const consumed = useSuggestionsStore((state) => state.consumed)

  // Filter suggestions (excluding consumed)
  const filteredSuggestions = useMemo(() => {
    let suggestions = cachedSuggestions

    // Filter out consumed suggestions (recipes/analysis that have been applied)
    suggestions = suggestions.filter(s => !consumed.has(s.id))

    // Filter by category
    if (activeCategory !== 'all') {
      suggestions = suggestions.filter(s => s.category === activeCategory)
    }

    return suggestions
  }, [cachedSuggestions, activeCategory, consumed])

  // Get table data to compute effective cleaning count
  const tableData = useDataStore((state) => state.tableData[tableId])
  
  // Track effective cleaning count (from CleaningPanel callback)
  const [effectiveCleaningCount, setEffectiveCleaningCount] = useState<number | null>(null)

  // Check if Phase 2 profile is still loading (for highlight suggestions that need q1/q3/iqr)
  const isPhase2Loading = useMemo(() => {
    if (!profile || profileLoading) return false
    // Phase 2 runs in background, so if phase is 1, Phase 2 might still be loading
    // Check if there are numeric columns that might need Phase 2 stats
    if (profile.phase === 1) {
      const hasNumericColumns = profile.columns.some(col => 
        col.min !== undefined || col.max !== undefined
      )
      // If we have numeric columns but no q1/q3/iqr stats, Phase 2 is likely still loading
      const hasPhase2Stats = profile.columns.some(col => 
        col.q1 !== undefined || col.q3 !== undefined || col.iqr !== undefined
      )
      return hasNumericColumns && !hasPhase2Stats
    }
    return false
  }, [profile, profileLoading])

  // Category counts - use effective count for cleaning when available
  const categoryCounts = useMemo(() => {
    // For cleaning, we need to check if suggestions would actually result in changes
    // This is a simplified version of what CleaningPanel does
    let cleaningCount = 0
    
    if (tableData?.rows) {
      const cleaningSuggestions = cachedSuggestions.filter(s => s.category === 'cleaning' && s.context.cleaningOperation)
      
      for (const suggestion of cleaningSuggestions) {
        const operation = suggestion.context.cleaningOperation
        const columnId = suggestion.context.columnId
        if (!operation || !columnId) continue
        
        // Check if this suggestion would affect any cells
        let hasEffect = false
        for (const row of tableData.rows) {
          const value = row[columnId]
          
          // Check if operation would have an effect
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
            // For other operations, assume they have an effect if they pass the 'when' condition
            hasEffect = true
            break
          }
        }
        
        if (hasEffect) {
          cleaningCount++
        }
      }
    } else {
      // No table data yet, show raw count
      cleaningCount = cachedSuggestions.filter(s => s.category === 'cleaning').length
    }
    
    // If CleaningPanel has reported its count, prefer that (more accurate)
    const finalCleaningCount = effectiveCleaningCount ?? cleaningCount
    
    // Filter out consumed suggestions from counts
    const nonConsumed = cachedSuggestions.filter(s => !consumed.has(s.id))
    
    return {
      all: nonConsumed.length,
      cleaning: finalCleaningCount,
      analysis: nonConsumed.filter(s => s.category === 'analysis').length,
      recipe: nonConsumed.filter(s => s.category === 'recipe').length,
    }
  }, [cachedSuggestions, tableData?.rows, effectiveCleaningCount, consumed])

  // Handle apply
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
        {/* Header */}
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

        {/* Category tabs */}
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

        {/* Content area */}
        {activeCategory === 'cleaning' ? (
          /* Cleaning Panel - batch mode for cleaning suggestions */
          <CleaningPanel
            suggestions={cachedSuggestions}
            tableId={tableId}
            onComplete={() => {
              // Close panel after cleaning - forces full reset when reopened
              onClose()
            }}
            onCountChange={setEffectiveCleaningCount}
          />
        ) : (
          /* Suggestions list - for analysis and recipe */
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Skeleton loading */}
            {showLoading && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCard key={i} delay={i * 50} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!showLoading && filteredSuggestions.length === 0 && (
              <EmptyState 
                hasColumn={!!selectedColumnId}
                hasTable={!!node}
                category={activeCategory === 'all' ? undefined : activeCategory}
              />
            )}

            {/* Suggestion cards */}
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

      {/* Toast notification */}
      {toast && (
        <Toast 
          notification={toast} 
          onDismiss={() => setToast(null)} 
        />
      )}

      {/* Recipe Wizard */}
      <RecipeWizard
        isOpen={recipeWizardSuggestion !== null}
        onClose={() => setRecipeWizardSuggestion(null)}
        suggestion={recipeWizardSuggestion}
        onExecute={async (transform: TransformDef, tableName: string) => {
          if (recipeWizardSuggestion) {
            const sourceTableId = recipeWizardSuggestion.context.tableId
            const result = await executeRecipeTransform(transform, tableName, sourceTableId)
            // Mark suggestion as consumed so it doesn't reappear
            if (result.success) {
              useSuggestionsStore.getState().consumeSuggestion(recipeWizardSuggestion.id)
            }
          }
        }}
      />
    </>
  )
}

// Skeleton card for loading state
function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div 
      className="bg-surface rounded-lg border border-border p-4 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-surface-secondary rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-surface-secondary rounded w-3/4" />
          <div className="h-3 bg-surface-secondary rounded w-1/2" />
        </div>
      </div>
    </div>
  )
}

// Empty state component with category-specific messaging
function EmptyState({ hasColumn, hasTable, category }: { hasColumn: boolean; hasTable: boolean; category?: string }) {
  // Category-specific icons and messages
  const getEmptyStateContent = () => {
    if (!hasTable) {
      return {
        icon: (
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        ),
        title: 'No table selected',
        description: 'Select a table to see suggestions.',
      }
    }
    
    if (category === 'analysis') {
      return {
        icon: (
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        title: 'No analysis suggestions',
        description: hasColumn 
          ? 'This column may not be suitable for charts. Try a categorical or numeric column.'
          : 'Add categorical and numeric columns to enable visualizations, or use the "Create Chart" button in the table view.',
      }
    }
    
    if (category === 'recipe') {
      return {
        icon: (
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        ),
        title: 'No recipe suggestions',
        description: 'Recipes help aggregate and transform data. Try adding group-by candidates like categorical columns.',
      }
    }
    
    // Default / All categories
    return {
      icon: (
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      title: 'No suggestions available',
      description: hasColumn 
        ? 'No actions needed for this column.'
        : 'Your data looks clean! Import more data to see suggestions.',
    }
  }
  
  const content = getEmptyStateContent()
  
  return (
    <div className="text-center py-8 px-4 text-text-tertiary">
      {content.icon}
      <p className="text-sm font-medium text-text-secondary">{content.title}</p>
      <p className="text-xs mt-1 max-w-[250px] mx-auto">
        {content.description}
      </p>
    </div>
  )
}

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: SuggestionConfidence }) {
  const colors = {
    high: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[confidence]}`}>
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
    </span>
  )
}

// Suggestion Card Component
function SuggestionCard({
  suggestion,
  isExpanded,
  isApplying,
  animationDelay,
  onToggle,
  onApply,
}: {
  suggestion: Suggestion
  isExpanded: boolean
  isApplying: boolean
  animationDelay: number
  onToggle: () => void
  onApply: () => void
}) {
  const [showWhy, setShowWhy] = useState(false)

  const categoryColors: Record<SuggestionCategory, string> = {
    cleaning: 'bg-accent-orange/10 text-accent-orange',
    analysis: 'bg-accent-green/10 text-accent-green',
    recipe: 'bg-accent-purple/10 text-accent-purple',
  }

  const categoryIcons: Record<SuggestionCategory, JSX.Element> = {
    cleaning: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    analysis: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    recipe: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  }

  const actionLabel = suggestion.category === 'recipe' ? 'Open Recipe' : 'Apply'

  return (
    <div 
      className="bg-surface rounded-lg border border-border overflow-hidden transition-all duration-200 hover:shadow-md animate-fade-in-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface-secondary/30 transition-colors"
      >
        <div className={`p-2 rounded-lg shrink-0 ${categoryColors[suggestion.category]}`}>
          {categoryIcons[suggestion.category]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-medium text-text-primary truncate">
              {suggestion.title}
            </h3>
            <ConfidenceBadge confidence={suggestion.confidence} />
          </div>
          {suggestion.description && (
            <p className="text-xs text-text-secondary line-clamp-2">
              {suggestion.description}
            </p>
          )}
          {suggestion.impact && (
            <p className="text-[11px] text-text-tertiary mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              {suggestion.impact.summary}
            </p>
          )}
        </div>
        <svg 
          className={`w-5 h-5 text-text-tertiary transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border pt-3 animate-expand-down">
          {/* Why this? */}
          {suggestion.why && suggestion.why.length > 0 && (
            <div className="mb-3">
              <button 
                onClick={() => setShowWhy(!showWhy)}
                className="text-xs text-accent-green hover:text-accent-green/80 flex items-center gap-1 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform ${showWhy ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Why this suggestion?
              </button>
              {showWhy && (
                <ul className="mt-2 space-y-1 pl-4">
                  {suggestion.why.map((reason, i) => (
                    <li key={i} className="text-xs text-text-tertiary flex items-start gap-2">
                      <span className="text-accent-green mt-1">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Preview placeholder */}
          {suggestion.preview?.status === 'ready' && suggestion.preview.data && (
            <div className="mb-3 p-3 bg-surface-secondary rounded-lg text-xs text-text-secondary">
              <span className="font-medium">Preview:</span>
              {/* Render preview based on type */}
              <span className="ml-1">Preview data available</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onApply}
              disabled={isApplying}
              className="btn btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Applying...
                </>
              ) : (
                actionLabel
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
