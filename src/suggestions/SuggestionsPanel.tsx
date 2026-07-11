import { useState, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
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
    filteredSuggestions,
    showLoading,
    activeCategory,
    setActiveCategory,
    categoryCounts,
    isPhase2Loading,
    error,
    retry,
    dismissedCount,
    dismissSuggestion,
    restoreDismissed,
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
    return () => setToastHandler(null)
  }, [])

  useEffect(() => {
    setRecipeWizardCallback((suggestion) => {
      setRecipeWizardSuggestion(suggestion)
    })
    return () => setRecipeWizardCallback(null)
  }, [])

  const handleApply = useCallback(async (suggestion: Suggestion) => {
    if (suggestion.category === 'cleaning' && suggestion.context.cleaningOperation) {
      setActiveCategory('cleaning')
      setExpandedId(null)
      return
    }

    setApplyingId(suggestion.id)
    try {
      const result = await applySuggestion(suggestion)
      if (!result.success) {
        setToast({
          type: 'error',
          message: result.error || result.message,
        })
      }
    } catch (error) {
      console.error('Failed to apply suggestion:', error)
      setToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not apply suggestion',
      })
    } finally {
      setApplyingId(null)
    }
  }, [setActiveCategory])

  if (!isOpen) return null

  const selectedColumnName = selectedColumnId
    ? node?.schema?.columns.find((column) => column.id === selectedColumnId)?.name
    : undefined

  return (
    <>
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-xl animate-slide-in-right focus:outline-none"
          >
            <SuggestionsPanelHeader
              tableName={node?.name || 'Table'}
              selectedColumnName={selectedColumnName}
              onClose={onClose}
            />

            <CategoryTabs
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              categoryCounts={categoryCounts}
              isPhase2Loading={isPhase2Loading}
            />

            {dismissedCount > 0 && (
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
                <span className="text-text-tertiary">{dismissedCount} dismissed</span>
                <button onClick={restoreDismissed} className="text-accent-green hover:underline">
                  Restore
                </button>
              </div>
            )}

            <div
              id="suggestion-category-panel"
              role="tabpanel"
              aria-labelledby={`suggestion-tab-${activeCategory}`}
              className="flex min-h-0 flex-1 flex-col"
            >
              {error && (
                <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30" role="alert">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Could not analyze this table</p>
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
                  <button onClick={retry} className="btn btn-secondary mt-3 text-xs">Try again</button>
                </div>
              )}

              {!error && activeCategory === 'cleaning' ? (
                <CleaningPanel
                  suggestions={filteredSuggestions}
                  tableId={tableId}
                  onComplete={onClose}
                  onCountChange={setEffectiveCleaningCount}
                />
              ) : !error ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-busy={showLoading}>
                  {showLoading && (
                    <div className="space-y-3" role="status" aria-label="Analyzing table">
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
                      onDismiss={() => dismissSuggestion(suggestion.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
            } else {
              throw new Error(result.error || result.message)
            }
          }
        }}
      />
    </>
  )
}
