/**
 * Health Score Hero Component
 * 
 * Displays overall data quality with a visual gauge and quick stats.
 */

import type { ProjectHealthMetrics } from '../useDashboardData'

interface HealthScoreHeroProps {
  metrics: ProjectHealthMetrics
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
  if (completeness >= 50) return 'Needs Attention'
  return 'Poor'
}

export function HealthScoreHero({ metrics }: HealthScoreHeroProps) {
  const {
    overallCompleteness,
    totalIssues,
    tablesWithIssues,
    totalTables,
    totalRows,
    totalColumns,
    chartCount,
    isLoading,
  } = metrics

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Gauge Section */}
        <div className="flex items-center gap-6">
          {/* Circular Gauge */}
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-surface-secondary"
              />
              {/* Progress circle */}
              {!isLoading && (
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${overallCompleteness * 2.64} 264`}
                  className={getHealthColor(overallCompleteness)}
                  style={{ transition: 'stroke-dasharray 0.5s ease-out' }}
                />
              )}
            </svg>
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-text-tertiary border-t-accent-green rounded-full animate-spin" />
              ) : (
                <>
                  <span className={`text-2xl font-bold ${getHealthColor(overallCompleteness)}`}>
                    {overallCompleteness}%
                  </span>
                  <span className="text-xs text-text-tertiary">Complete</span>
                </>
              )}
            </div>
          </div>

          {/* Health Status */}
          <div>
            <h2 className="text-xl font-semibold text-text-primary mb-1">
              Data Health
            </h2>
            {isLoading ? (
              <div className="h-5 w-24 bg-surface-secondary rounded animate-pulse" />
            ) : (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${getHealthBgColor(overallCompleteness)} text-white`}>
                  {getHealthLabel(overallCompleteness)}
                </span>
                {totalIssues > 0 && (
                  <span className="text-sm text-text-secondary">
                    {totalIssues} issue{totalIssues !== 1 ? 's' : ''} found
                  </span>
                )}
              </div>
            )}
            {!isLoading && tablesWithIssues > 0 && (
              <p className="text-sm text-text-tertiary mt-1">
                {tablesWithIssues} of {totalTables} table{totalTables !== 1 ? 's' : ''} need attention
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-20 bg-border" />

        {/* Quick Stats */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickStat
            label="Tables"
            value={totalTables}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
            isLoading={isLoading}
          />
          <QuickStat
            label="Rows"
            value={formatNumber(totalRows)}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            }
            isLoading={isLoading}
          />
          <QuickStat
            label="Columns"
            value={totalColumns}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            }
            isLoading={isLoading}
          />
          <QuickStat
            label="Charts"
            value={chartCount}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  )
}

// Quick Stat Component
function QuickStat({ 
  label, 
  value, 
  icon, 
  isLoading 
}: { 
  label: string
  value: string | number
  icon: React.ReactNode
  isLoading: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center text-text-tertiary">
        {icon}
      </div>
      <div>
        {isLoading ? (
          <div className="h-6 w-12 bg-surface-secondary rounded animate-pulse" />
        ) : (
          <p className="text-lg font-semibold text-text-primary">{value}</p>
        )}
        <p className="text-xs text-text-tertiary">{label}</p>
      </div>
    </div>
  )
}

// Format large numbers with K/M suffix
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toLocaleString()
}
