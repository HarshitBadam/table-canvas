import type { Suggestion } from '@/types'
import { useNavigation } from '@/app/NavigationContext'

interface QuickActionsSectionProps {
  suggestions: Suggestion[]
  onApply: (suggestion: Suggestion) => void
  isLoading: boolean
}

function getActionLabel(suggestion: Suggestion): string {
  const action = suggestion.action
  
  if (action.kind === 'createChart') {
    return 'Create Chart'
  }
  if (action.kind === 'createDerivedTable') {
    return 'Create Table'
  }
  if (action.kind === 'applyPatch') {
    return 'Fix Data'
  }
  
  return 'Apply'
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

export function QuickActionsSection({ 
  suggestions, 
  onApply, 
  isLoading 
}: QuickActionsSectionProps) {
  const { openTable } = useNavigation()
  const topSuggestions = suggestions.slice(0, 3)

  if (isLoading) {
    return (
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Suggested Actions</h2>
          <p className="text-sm text-text-tertiary">Recommendations based on your data</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-surface-secondary rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-surface-secondary rounded mb-2" />
                  <div className="h-3 w-20 bg-surface-secondary rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-surface-secondary rounded mb-4" />
              <div className="h-10 w-full bg-surface-secondary rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (topSuggestions.length === 0) {
    return (
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Suggested Actions</h2>
          <p className="text-sm text-text-tertiary">Recommendations based on your data</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <p className="text-text-tertiary">
            No suggestions yet. Import more data to discover insights.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">Suggested Actions</h2>
        <p className="text-sm text-text-tertiary">Recommendations based on your data</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {topSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="bg-surface rounded-xl border border-border p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getCategoryColor(suggestion.category)}`}>
                {getSuggestionIcon(suggestion)}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-text-primary leading-tight">
                  {suggestion.title}
                </h4>
                <button
                  onClick={() => openTable(suggestion.context.tableId)}
                  className="text-xs text-text-tertiary hover:text-accent-green transition-colors"
                >
                  View table
                </button>
              </div>
            </div>

            <p className="text-sm text-text-secondary mb-4 line-clamp-2">
              {suggestion.description}
            </p>

            <button
              onClick={() => onApply(suggestion)}
              className="w-full px-4 py-2.5 text-sm font-medium bg-accent-green text-white rounded-lg hover:bg-accent-green/90 transition-colors"
            >
              {getActionLabel(suggestion)}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
