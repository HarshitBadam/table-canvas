import type { Suggestion } from '@/types'
import { useNavigation } from '@/layout/navigation/NavigationContext'

interface QuickActionsSectionProps {
  suggestions: Suggestion[]
  onApply: (suggestion: Suggestion) => void
  isLoading: boolean
}

function getSuggestionIcon(suggestion: Suggestion) {
  const category = suggestion.category

  if (category === 'analysis') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  }
  if (category === 'cleaning') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    )
  }

  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function getCategoryColor(category: Suggestion['category']): string {
  switch (category) {
    case 'analysis':
      return 'bg-blue-500/10 text-blue-600'
    case 'cleaning':
      return 'bg-orange-500/10 text-orange-600'
    case 'recipe':
      return 'bg-purple-500/10 text-purple-600'
    default:
      return 'bg-surface-secondary text-text-tertiary'
  }
}

function SuggestionsHeader() {
  return (
    <header className="mb-3">
      <h2 className="text-sm font-semibold text-text-primary">Suggested Actions</h2>
      <p className="text-xs text-text-tertiary">Recommended next steps based on your data</p>
    </header>
  )
}

export function QuickActionsSection({
  suggestions,
  onApply,
  isLoading,
}: QuickActionsSectionProps) {
  const { openTable } = useNavigation()
  const topSuggestions = suggestions.slice(0, 3)

  if (isLoading) {
    return (
      <section>
        <SuggestionsHeader />
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-4">
              <div className="h-8 w-8 shrink-0 rounded bg-surface-secondary" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 h-4 w-40 rounded bg-surface-secondary" />
                <div className="h-3 w-64 max-w-full rounded bg-surface-secondary" />
              </div>
              <div className="h-8 w-8 rounded bg-surface-secondary" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (topSuggestions.length === 0) {
    return (
      <section>
        <SuggestionsHeader />
        <p className="rounded-xl border border-border bg-surface px-4 py-5 text-sm text-text-tertiary shadow-sm">
          No suggestions yet. Import more data to discover insights.
        </p>
      </section>
    )
  }

  return (
    <section>
      <SuggestionsHeader />

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {topSuggestions.map((suggestion) => {
          const opensTable =
            suggestion.category === 'cleaning' || suggestion.action.kind === 'launchRecipe'

          return (
            <div key={suggestion.id} className="flex items-center gap-3 px-4 py-4">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${getCategoryColor(suggestion.category)}`}>
                {getSuggestionIcon(suggestion)}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-text-primary">
                  {suggestion.title}
                </h3>
                <p className="mt-0.5 line-clamp-1 text-sm text-text-secondary">
                  {suggestion.description}
                </p>
                <button
                  onClick={() => openTable(suggestion.context.tableId)}
                  className="mt-1 text-xs text-text-tertiary transition-colors hover:text-accent-green"
                >
                  View source table
                </button>
              </div>

              <button
                onClick={() => {
                  if (opensTable) {
                    openTable(suggestion.context.tableId)
                  } else {
                    onApply(suggestion)
                  }
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
                aria-label={`Apply suggestion: ${suggestion.title}`}
                title="Apply suggestion"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m10 6 6 6-6 6" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
