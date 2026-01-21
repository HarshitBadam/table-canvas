/**
 * What To Do Next Section Component
 * 
 * Shows prioritized suggestions with clear, actionable CTAs.
 * Limited to 3 suggestions for focus.
 */

import type { Suggestion } from '@/lib/types'

interface QuickActionsSectionProps {
  suggestions: Suggestion[]
  onApply: (suggestion: Suggestion) => void
  onOpenTable: (tableId: string) => void
  isLoading: boolean
}

// Get human-readable action label
function getActionLabel(suggestion: Suggestion): string {
  const action = suggestion.action
  
  if (action.type === 'create_chart') {
    return 'Create Chart'
  }
  if (action.type === 'create_derived_table') {
    return 'Create Table'
  }
  if (action.type === 'apply_patch') {
    return 'Fix Data'
  }
  
  return 'Apply'
}

// Get icon for suggestion type
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
  
  // Recipe
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

// Get category color
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
  onOpenTable,
  isLoading 
}: QuickActionsSectionProps) {
  // Limit to 3 suggestions
  const topSuggestions = suggestions.slice(0, 3)

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">What To Do Next</h3>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 bg-surface-secondary rounded-lg" />
              <div className="flex-1">
                <div className="h-4 w-40 bg-surface-secondary rounded mb-1" />
                <div className="h-3 w-full bg-surface-secondary rounded" />
              </div>
              <div className="w-20 h-8 bg-surface-secondary rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (topSuggestions.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">What To Do Next</h3>
        </div>
        <div className="p-4">
          <p className="text-sm text-text-tertiary">
            No suggestions right now. Explore your data to discover insights.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border">
      {/* Section Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">What To Do Next</h3>
      </div>

      {/* Suggestions List */}
      <div className="divide-y divide-border">
        {topSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="p-4 hover:bg-surface-secondary/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getCategoryColor(suggestion.category)}`}>
                {getSuggestionIcon(suggestion)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium text-text-primary">
                    {suggestion.title}
                  </h4>
                </div>
                <p className="text-xs text-text-secondary mb-2">
                  {suggestion.description}
                </p>
                <button
                  onClick={() => onOpenTable(suggestion.tableId)}
                  className="text-xs text-text-tertiary hover:text-accent-green transition-colors"
                >
                  From {suggestion.tableName || 'table'} →
                </button>
              </div>

              {/* Action Button */}
              <button
                onClick={() => onApply(suggestion)}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-accent-green text-white rounded-lg hover:bg-accent-green/90 transition-colors"
              >
                {getActionLabel(suggestion)}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* View More Link */}
      {suggestions.length > 3 && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-text-tertiary text-center">
            +{suggestions.length - 3} more suggestion{suggestions.length - 3 !== 1 ? 's' : ''} available
          </p>
        </div>
      )}
    </div>
  )
}
