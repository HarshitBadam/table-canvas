/**
 * Key Insights Section Component
 * 
 * Surfaces top findings from profiling across all tables.
 */

import type { Insight } from '../useDashboardData'

interface KeyInsightsSectionProps {
  insights: Insight[]
  onOpenTable: (tableId: string) => void
  isLoading: boolean
}

function getInsightIcon(type: Insight['type']) {
  switch (type) {
    case 'high_missing':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    case 'key_candidate':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      )
    case 'date_range':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    case 'category_distribution':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      )
    case 'outliers':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    case 'completeness_warning':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    default:
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
  }
}

function getSeverityStyles(severity: Insight['severity']): { bg: string; icon: string; border: string } {
  switch (severity) {
    case 'warning':
      return { 
        bg: 'bg-orange-500/5 hover:bg-orange-500/10', 
        icon: 'text-orange-500 bg-orange-500/10',
        border: 'border-orange-500/20'
      }
    case 'success':
      return { 
        bg: 'bg-green-500/5 hover:bg-green-500/10', 
        icon: 'text-green-500 bg-green-500/10',
        border: 'border-green-500/20'
      }
    case 'info':
    default:
      return { 
        bg: 'bg-blue-500/5 hover:bg-blue-500/10', 
        icon: 'text-blue-500 bg-blue-500/10',
        border: 'border-blue-500/20'
      }
  }
}

export function KeyInsightsSection({ 
  insights, 
  onOpenTable,
  isLoading 
}: KeyInsightsSectionProps) {
  // Show loading skeleton
  if (isLoading) {
    return (
      <div className="mb-6">
        <h3 className="text-base font-semibold text-text-primary mb-4">Key Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-surface rounded-xl border border-border animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-secondary" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-surface-secondary rounded mb-2" />
                  <div className="h-3 w-full bg-surface-secondary rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Don't render if no insights
  if (insights.length === 0) {
    return null
  }

  // Separate warnings from other insights
  const warnings = insights.filter(i => i.severity === 'warning')
  const others = insights.filter(i => i.severity !== 'warning')

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Key Insights</h3>
        <span className="text-xs text-text-tertiary">
          {insights.length} finding{insights.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {/* Warnings first (if any) */}
      {warnings.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-orange-600 mb-2">Needs Attention</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {warnings.map((insight) => (
              <InsightCard 
                key={insight.id} 
                insight={insight} 
                onClick={() => onOpenTable(insight.tableId)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Other insights */}
      {others.length > 0 && (
        <div>
          {warnings.length > 0 && (
            <p className="text-xs font-medium text-text-tertiary mb-2">Other Findings</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {others.map((insight) => (
              <InsightCard 
                key={insight.id} 
                insight={insight} 
                onClick={() => onOpenTable(insight.tableId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Individual Insight Card
function InsightCard({ 
  insight, 
  onClick 
}: { 
  insight: Insight
  onClick: () => void 
}) {
  const styles = getSeverityStyles(insight.severity)

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-xl border text-left transition-all ${styles.bg} ${styles.border}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${styles.icon}`}>
          {getInsightIcon(insight.type)}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-text-primary mb-0.5">
            {insight.title}
          </h4>
          <p className="text-xs text-text-secondary line-clamp-2">
            {insight.description}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            in {insight.tableName}
          </p>
        </div>
        <svg className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}
