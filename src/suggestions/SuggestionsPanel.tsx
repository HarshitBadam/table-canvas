import { useState, useEffect, useCallback } from 'react'
import { applySuggestion, setToastHandler, setRecipeWizardCallback, executeRecipeTransform, type ToastNotification } from './commands'
import { RecipeWizard } from './RecipeWizard'
import { CleaningPanel } from './CleaningPanel'
import { Toast } from './Toast'
import { SkeletonCard } from './SkeletonCard'
import { EmptyState } from './EmptyState'
import { SuggestionCard } from './SuggestionCard'
import { SuggestionsPanelHeader } from './SuggestionsPanelHeader'
import { CategoryTabs } from './CategoryTabs'
import { useSuggestionsStore } from './suggestionsStore'
import { useSuggestionsPanel } from './useSuggestionsPanel'
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
  const {
    node,
    cachedSuggestions,
    filteredSuggestions,
    showLoading,
    activeCategory,
    setActiveCategory,
    categoryCounts,
    isPhase2Loading,
    setEffectiveCleaningCount,
  } = useSuggestionsPanel(tableId, selectedColumnId, isOpen)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastNotification | null>(null)
  const [recipeWizardSuggestion, setRecipeWizardSuggestion] = useState<Suggestion | null>(null)

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

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-y-0 right-0 w-96 bg-surface border-l border-border shadow-xl z-50 flex flex-col animate-slide-in-right">
        <SuggestionsPanelHeader selectedColumnId={selectedColumnId} onClose={onClose} />

        <CategoryTabs
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          categoryCounts={categoryCounts}
          isPhase2Loading={isPhase2Loading}
        />

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
