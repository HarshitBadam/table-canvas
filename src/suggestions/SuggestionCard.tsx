import { useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { Suggestion, SuggestionCategory, SuggestionConfidence } from '@/types'

function ConfidenceBadge({ confidence }: { confidence: SuggestionConfidence }) {
  const colors = {
    high: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }

  return (
    <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${colors[confidence]}`}>
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
    </span>
  )
}

const categoryColors: Record<SuggestionCategory, string> = {
  cleaning: 'bg-accent-orange/10 text-accent-orange',
  analysis: 'bg-surface-tertiary text-text-secondary',
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

function getActionLabel(suggestion: Suggestion): string {
  switch (suggestion.action.kind) {
    case 'createChart':
      return 'Create chart'
    case 'createDerivedTable':
      return 'Create table'
    case 'launchRecipe':
      return 'Configure'
    case 'highlightCells':
      return 'Review in grid'
    case 'applyPatch':
      return 'Review fix'
  }
}

function SuggestionPreview({ suggestion }: { suggestion: Suggestion }) {
  const preview = suggestion.preview
  if (!preview || preview.status === 'not_loaded') return null
  if (preview.status === 'loading') {
    return <p className="mb-3 text-xs text-text-secondary" role="status">Loading preview…</p>
  }
  if (preview.status === 'error') {
    return <p className="mb-3 text-xs text-red-600 dark:text-red-400" role="alert">{preview.error || 'Preview unavailable'}</p>
  }
  if (!preview.data) return null

  const data = preview.data
  return (
    <div className="mb-3 rounded-lg bg-surface-secondary p-3 text-xs text-text-secondary">
      <p className="mb-2 font-medium text-text-primary">Preview</p>
      {data.kind === 'beforeAfter' && (
        <div className="space-y-1">
          {data.rows.slice(0, 3).map((row, index) => (
            <p key={index}>
              <code>{String(row.before)}</code> <span aria-hidden="true">→</span> <code>{String(row.after)}</code>
            </p>
          ))}
        </div>
      )}
      {(data.kind === 'tableSample' || data.kind === 'aggregateSample') && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr>{data.columns.map((column) => <th key={column} className="pr-3 font-medium">{column}</th>)}</tr></thead>
            <tbody>
              {data.rows.slice(0, 3).map((row, index) => (
                <tr key={index}>{row.map((value, cellIndex) => <td key={cellIndex} className="pr-3">{String(value ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.kind === 'recipeOutputs' && (
        <ul className="list-disc pl-4">
          {data.outputs.map((output) => <li key={`${output.type}:${output.name}`}>{output.name} ({output.type})</li>)}
        </ul>
      )}
    </div>
  )
}

export function SuggestionCard({
  suggestion,
  isExpanded,
  isApplying,
  onToggle,
  onApply,
  onDismiss,
}: {
  suggestion: Suggestion
  isExpanded: boolean
  isApplying: boolean
  onToggle: () => void
  onApply: () => void
  onDismiss: () => void
}) {
  const [showWhy, setShowWhy] = useState(false)

  const actionLabel = getActionLabel(suggestion)
  const detailsId = `suggestion-details-${suggestion.id}`

  return (
    <div className={`overflow-hidden rounded-lg transition-colors ${isExpanded ? 'bg-surface-secondary' : 'bg-surface hover:bg-surface-secondary/60'}`}>
      <button
        onClick={onToggle}
        aria-label={`${suggestion.title}: ${isExpanded ? 'Collapse' : 'Expand'} details`}
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors"
      >
        <div className={`mt-0.5 shrink-0 rounded-md p-1.5 ${categoryColors[suggestion.category]}`}>
          {categoryIcons[suggestion.category]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <h3 className="min-w-0 flex-1 text-sm font-medium leading-5 text-text-primary">
              {suggestion.title}
            </h3>
            <ConfidenceBadge confidence={suggestion.confidence} />
          </div>
          {suggestion.description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-secondary">
              {suggestion.description}
            </p>
          )}
          {suggestion.impact && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-tertiary">
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
        <div id={detailsId} className="px-3 pb-3 pl-12">
          {suggestion.why && suggestion.why.length > 0 && (
            <div className="mb-3 rounded-md bg-surface px-3 py-2.5">
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
                <ul className="mt-2 space-y-1.5">
                  {suggestion.why.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs leading-5 text-text-secondary">
                      <span className="text-text-tertiary" aria-hidden="true">-</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <SuggestionPreview suggestion={suggestion} />

          <div className="flex gap-2">
            <button
              onClick={onApply}
              disabled={isApplying}
              className="btn btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <LoadingSpinner size="sm" />
                  Applying...
                </>
              ) : (
                actionLabel
              )}
            </button>
            <button
              onClick={onDismiss}
              disabled={isApplying}
              className="btn btn-ghost text-xs py-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
