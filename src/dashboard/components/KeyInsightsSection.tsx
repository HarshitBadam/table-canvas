/**
 * What We Found Section Component
 * 
 * Surfaces findings from profiling in plain English, grouped by table.
 * Clear, scannable insights without confusing technical jargon.
 */

import type { Insight } from '../useDashboardData'

interface KeyInsightsSectionProps {
  insights: Insight[]
  onOpenTable: (tableId: string) => void
  isLoading: boolean
}

// Convert insight type to plain English
function getInsightDescription(insight: Insight): string {
  switch (insight.type) {
    case 'key_candidate':
      return `"${insight.columnName}" could be a unique identifier (all values are distinct)`
    case 'date_range':
      const data = insight.data as { min?: string; max?: string } | undefined
      if (data?.min && data?.max) {
        return `"${insight.columnName}" contains dates from ${formatDate(data.min)} to ${formatDate(data.max)}`
      }
      return `"${insight.columnName}" contains date values`
    case 'category_distribution':
      const catData = insight.data as { distinctCount?: number } | undefined
      return `"${insight.columnName}" has ${catData?.distinctCount || 'several'} different values`
    case 'high_missing':
      return `"${insight.columnName}" has missing values that may need attention`
    case 'outliers':
      return `"${insight.columnName}" contains values that look unusual`
    case 'completeness_warning':
      return 'All columns have complete data'
    default:
      return insight.description
  }
}

function formatDate(dateStr: string): string {
  try {
    // Handle Unix timestamps
    if (/^\d+$/.test(dateStr)) {
      const date = new Date(parseInt(dateStr))
      return date.toLocaleDateString()
    }
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString()
    }
    return dateStr
  } catch {
    return dateStr
  }
}

export function KeyInsightsSection({ 
  insights, 
  onOpenTable,
  isLoading 
}: KeyInsightsSectionProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">What We Found</h3>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 w-24 bg-surface-secondary rounded mb-2" />
              <div className="h-3 w-full bg-surface-secondary rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Filter out less useful insights, keep it focused
  const usefulInsights = insights.filter(i => 
    i.type !== 'completeness_warning' || i.severity === 'warning'
  ).slice(0, 8) // Limit to 8 insights max

  // Group by table
  const insightsByTable = usefulInsights.reduce((acc, insight) => {
    const tableName = insight.tableName
    if (!acc[tableName]) {
      acc[tableName] = { tableId: insight.tableId, insights: [] }
    }
    acc[tableName].insights.push(insight)
    return acc
  }, {} as Record<string, { tableId: string; insights: Insight[] }>)

  const tableNames = Object.keys(insightsByTable)

  // Empty state
  if (tableNames.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">What We Found</h3>
        </div>
        <div className="p-4">
          <p className="text-sm text-text-tertiary">
            No notable findings. Your data looks straightforward.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border">
      {/* Section Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">What We Found</h3>
        <span className="text-xs text-text-tertiary">
          {usefulInsights.length} finding{usefulInsights.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Insights by Table */}
      <div className="divide-y divide-border">
        {tableNames.map((tableName) => {
          const { tableId, insights: tableInsights } = insightsByTable[tableName]
          
          return (
            <button
              key={tableId}
              onClick={() => onOpenTable(tableId)}
              className="w-full px-4 py-3 text-left hover:bg-surface-secondary transition-colors group"
            >
              {/* Table Name */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-text-primary group-hover:text-accent-green transition-colors">
                  {tableName}
                </span>
                <svg className="w-3 h-3 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Insights for this table */}
              <ul className="space-y-1">
                {tableInsights.slice(0, 3).map((insight, idx) => (
                  <li key={insight.id} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="text-text-tertiary mt-0.5">•</span>
                    <span>{getInsightDescription(insight)}</span>
                  </li>
                ))}
                {tableInsights.length > 3 && (
                  <li className="text-xs text-text-tertiary pl-4">
                    +{tableInsights.length - 3} more
                  </li>
                )}
              </ul>
            </button>
          )
        })}
      </div>
    </div>
  )
}
