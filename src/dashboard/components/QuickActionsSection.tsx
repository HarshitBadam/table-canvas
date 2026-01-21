/**
 * Quick Actions Section Component
 * 
 * Shows top suggestions across all tables with one-click apply.
 */

import { useState } from 'react'
import type { Suggestion } from '@/lib/types'

interface QuickActionsSectionProps {
  suggestions: Array<Suggestion & { tableName: string }>
  onApply: (suggestion: Suggestion) => Promise<void>
  onOpenTable: (tableId: string) => void
  isLoading: boolean
}

function getCategoryIcon(category: Suggestion['category']) {
  switch (category) {
    case 'cleaning':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      )
    case 'analysis':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    case 'recipe':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      )
    default:
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
  }
}

function getCategoryStyles(category: Suggestion['category']): { bg: string; text: string; border: string } {
  switch (category) {
    case 'cleaning':
      return { 
        bg: 'bg-purple-500/10', 
        text: 'text-purple-600',
        border: 'border-purple-500/20 hover:border-purple-500/40'
      }
    case 'analysis':
      return { 
        bg: 'bg-blue-500/10', 
        text: 'text-blue-600',
        border: 'border-blue-500/20 hover:border-blue-500/40'
      }
    case 'recipe':
      return { 
        bg: 'bg-accent-green/10', 
        text: 'text-accent-green',
        border: 'border-accent-green/20 hover:border-accent-green/40'
      }
    default:
      return { 
        bg: 'bg-surface-secondary', 
        text: 'text-text-secondary',
        border: 'border-border hover:border-accent-green/40'
      }
  }
}

function getConfidenceBadge(confidence: Suggestion['confidence']) {
  switch (confidence) {
    case 'high':
      return <span className="text-xs text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">High</span>
    case 'medium':
      return <span className="text-xs text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded">Medium</span>
    case 'low':
      return <span className="text-xs text-text-tertiary bg-surface-secondary px-1.5 py-0.5 rounded">Low</span>
    default:
      return null
  }
}

export function QuickActionsSection({ 
  suggestions, 
  onApply,
  onOpenTable,
  isLoading 
}: QuickActionsSectionProps) {
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())

  const handleApply = async (suggestion: Suggestion) => {
    setApplyingId(suggestion.id)
    try {
      await onApply(suggestion)
      setAppliedIds(prev => new Set(prev).add(suggestion.id))
    } catch (error) {
      console.error('Failed to apply suggestion:', error)
    } finally {
      setApplyingId(null)
    }
  }

  // Show loading skeleton
  if (isLoading) {
    return (
      <div className="mb-6">
        <h3 className="text-base font-semibold text-text-primary mb-4">Quick Actions</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 bg-surface rounded-xl border border-border animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-secondary" />
                <div className="flex-1">
                  <div className="h-4 w-48 bg-surface-secondary rounded mb-2" />
                  <div className="h-3 w-32 bg-surface-secondary rounded" />
                </div>
                <div className="w-16 h-8 bg-surface-secondary rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Don't render if no suggestions
  if (suggestions.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Quick Actions</h3>
        <span className="text-xs text-text-tertiary">
          Top suggestions across all tables
        </span>
      </div>
      
      <div className="space-y-3">
        {suggestions.map((suggestion) => {
          const styles = getCategoryStyles(suggestion.category)
          const isApplying = applyingId === suggestion.id
          const isApplied = appliedIds.has(suggestion.id)

          return (
            <div
              key={suggestion.id}
              className={`p-4 bg-surface rounded-xl border transition-all ${styles.border}`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${styles.bg} ${styles.text}`}>
                  {getCategoryIcon(suggestion.category)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium text-text-primary truncate">
                      {suggestion.title}
                    </h4>
                    {getConfidenceBadge(suggestion.confidence)}
                  </div>
                  
                  {suggestion.description && (
                    <p className="text-xs text-text-secondary line-clamp-1 mb-1">
                      {suggestion.description}
                    </p>
                  )}
                  
                  <button
                    onClick={() => onOpenTable(suggestion.context.tableId)}
                    className="text-xs text-accent-green hover:underline"
                  >
                    {suggestion.tableName}
                  </button>
                </div>

                {/* Action Button */}
                <div className="flex-shrink-0">
                  {isApplied ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 px-3 py-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Applied
                    </span>
                  ) : (
                    <button
                      onClick={() => handleApply(suggestion)}
                      disabled={isApplying}
                      className={`
                        inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg
                        transition-all
                        ${isApplying 
                          ? 'bg-surface-secondary text-text-tertiary cursor-not-allowed' 
                          : 'bg-accent-green text-white hover:bg-accent-green/90'
                        }
                      `}
                    >
                      {isApplying ? (
                        <>
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Applying
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Apply
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Why this? tooltip */}
              {suggestion.why && suggestion.why.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-text-tertiary">
                    <span className="font-medium">Why: </span>
                    {suggestion.why[0]}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
