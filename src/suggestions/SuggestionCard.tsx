import { useState } from 'react'
import type { Suggestion, SuggestionCategory, SuggestionConfidence } from '@/types'

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

export function SuggestionCard({
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

  const actionLabel = suggestion.category === 'recipe' ? 'Open Recipe' : 'Apply'

  return (
    <div 
      className="bg-surface rounded-lg border border-border overflow-hidden transition-all duration-200 hover:shadow-md animate-fade-in-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
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

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border pt-3 animate-expand-down">
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

          {suggestion.preview?.status === 'ready' && suggestion.preview.data && (
            <div className="mb-3 p-3 bg-surface-secondary rounded-lg text-xs text-text-secondary">
              <span className="font-medium">Preview:</span>
              <span className="ml-1">Preview data available</span>
            </div>
          )}

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
