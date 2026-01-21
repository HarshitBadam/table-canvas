/**
 * Data Health Panel Component
 * 
 * Compact panel showing overall data health with gauge and issue summary.
 * Replaces the large HealthScoreHero.
 */

import type { ProjectHealthMetrics, TableQualityMetrics } from '../useDashboardData'

interface DataHealthPanelProps {
  metrics: ProjectHealthMetrics
  tableMetrics: TableQualityMetrics[]
}

function getHealthColor(completeness: number): string {
  if (completeness >= 90) return 'text-green-500'
  if (completeness >= 70) return 'text-yellow-500'
  if (completeness >= 50) return 'text-orange-500'
  return 'text-red-500'
}

function getHealthBgColor(completeness: number): string {
  if (completeness >= 90) return 'bg-green-500'
  if (completeness >= 70) return 'bg-yellow-500'
  if (completeness >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}

function getHealthLabel(completeness: number): string {
  if (completeness >= 90) return 'Excellent'
  if (completeness >= 70) return 'Good'
  if (completeness >= 50) return 'Needs Work'
  return 'Poor'
}

export function DataHealthPanel({ metrics, tableMetrics }: DataHealthPanelProps) {
  const { overallCompleteness, totalIssues, isLoading } = metrics

  // Collect all issues across tables for summary
  const allIssues = tableMetrics.flatMap(t => 
    t.issues.map(issue => ({
      ...issue,
      tableName: t.tableName,
    }))
  )

  // Group issues by type for summary
  const missingCount = allIssues.filter(i => i.type === 'missing').length
  const otherIssues = allIssues.filter(i => i.type !== 'missing')

  return (
    <div className="bg-surface rounded-xl border border-border">
      {/* Section Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Data Health</h3>
      </div>

      <div className="p-4">
        {/* Gauge and Status */}
        <div className="flex items-center gap-4 mb-4">
          {/* Mini Gauge */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-surface-secondary"
              />
              {!isLoading && (
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${overallCompleteness * 2.51} 251`}
                  className={getHealthColor(overallCompleteness)}
                  style={{ transition: 'stroke-dasharray 0.5s ease-out' }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-text-tertiary border-t-accent-green rounded-full animate-spin" />
              ) : (
                <span className={`text-sm font-bold ${getHealthColor(overallCompleteness)}`}>
                  {overallCompleteness}%
                </span>
              )}
            </div>
          </div>

          {/* Status Text */}
          <div>
            {isLoading ? (
              <div className="h-5 w-20 bg-surface-secondary rounded animate-pulse mb-1" />
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getHealthBgColor(overallCompleteness)} text-white`}>
                  {getHealthLabel(overallCompleteness)}
                </span>
              </div>
            )}
            <p className="text-xs text-text-secondary">
              {isLoading ? 'Analyzing...' : `${overallCompleteness}% of data is complete`}
            </p>
          </div>
        </div>

        {/* Issues Summary */}
        {!isLoading && totalIssues > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Issues Found</p>
            
            {missingCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{missingCount} column{missingCount !== 1 ? 's' : ''} with missing values</span>
              </div>
            )}

            {otherIssues.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{otherIssues.length} other suggestion{otherIssues.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* All Good State */}
        {!isLoading && totalIssues === 0 && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>All data looks good!</span>
          </div>
        )}
      </div>
    </div>
  )
}
