/**
 * Data Quality Section Component
 * 
 * Displays per-table quality cards with completeness bars and issue badges.
 */

import type { TableQualityMetrics, DataQualityIssue } from '../useDashboardData'

interface DataQualitySectionProps {
  tableMetrics: TableQualityMetrics[]
  onOpenTable: (tableId: string) => void
  onOpenSuggestions?: (tableId: string) => void
}

function getCompletenessColor(completeness: number): string {
  if (completeness >= 90) return 'bg-green-500'
  if (completeness >= 70) return 'bg-yellow-500'
  if (completeness >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}

function getIssueSeverityColor(severity: DataQualityIssue['severity']): string {
  switch (severity) {
    case 'high': return 'bg-red-500/10 text-red-500 border-red-500/20'
    case 'medium': return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
    case 'low': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    default: return 'bg-surface-secondary text-text-tertiary border-border'
  }
}

function getIssueIcon(type: DataQualityIssue['type']) {
  switch (type) {
    case 'missing':
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    case 'duplicate':
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )
    case 'outlier':
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    default:
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
  }
}

export function DataQualitySection({ 
  tableMetrics, 
  onOpenTable,
  onOpenSuggestions 
}: DataQualitySectionProps) {
  if (tableMetrics.length === 0) {
    return null
  }

  // Sort by completeness (worst first) to prioritize tables that need attention
  const sortedTables = [...tableMetrics].sort((a, b) => a.completeness - b.completeness)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Data Quality by Table</h3>
        <span className="text-xs text-text-tertiary">
          {tableMetrics.length} table{tableMetrics.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedTables.map((table) => (
          <TableQualityCard
            key={table.tableId}
            table={table}
            onOpen={() => onOpenTable(table.tableId)}
            onFixIssues={onOpenSuggestions ? () => onOpenSuggestions(table.tableId) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// Individual Table Quality Card
function TableQualityCard({
  table,
  onOpen,
  onFixIssues,
}: {
  table: TableQualityMetrics
  onOpen: () => void
  onFixIssues?: () => void
}) {
  const topIssues = table.issues.slice(0, 3)
  const hasMoreIssues = table.issues.length > 3

  return (
    <div 
      className="bg-surface rounded-xl border border-border hover:border-accent-green/50 transition-all cursor-pointer group"
      onClick={onOpen}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              table.tableKind === 'source_table' 
                ? 'bg-node-source text-node-source-border' 
                : 'bg-node-derived text-node-derived-border'
            }`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-text-primary truncate group-hover:text-accent-green transition-colors">
                {table.tableName}
              </h4>
              <p className="text-xs text-text-tertiary">
                {table.rowCount.toLocaleString()} rows, {table.columnCount} cols
              </p>
            </div>
          </div>
          
          {/* Completeness Badge */}
          {table.isLoading ? (
            <div className="w-12 h-6 bg-surface-secondary rounded animate-pulse flex-shrink-0" />
          ) : (
            <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
              table.completeness >= 90 ? 'bg-green-500/10 text-green-600' :
              table.completeness >= 70 ? 'bg-yellow-500/10 text-yellow-600' :
              table.completeness >= 50 ? 'bg-orange-500/10 text-orange-600' :
              'bg-red-500/10 text-red-600'
            }`}>
              {table.completeness}%
            </span>
          )}
        </div>

        {/* Completeness Bar */}
        <div className="mb-3">
          <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden">
            {table.isLoading ? (
              <div className="h-full w-full bg-surface-secondary animate-pulse" />
            ) : (
              <div 
                className={`h-full rounded-full transition-all duration-500 ${getCompletenessColor(table.completeness)}`}
                style={{ width: `${table.completeness}%` }}
              />
            )}
          </div>
        </div>

        {/* Issues */}
        {!table.isLoading && topIssues.length > 0 && (
          <div className="space-y-1.5">
            {topIssues.map((issue, idx) => (
              <div 
                key={idx}
                className={`flex items-center gap-2 text-xs px-2 py-1 rounded border ${getIssueSeverityColor(issue.severity)}`}
              >
                {getIssueIcon(issue.type)}
                <span className="truncate">
                  {issue.columnName ? `${issue.columnName}: ` : ''}{issue.description}
                </span>
              </div>
            ))}
            {hasMoreIssues && (
              <p className="text-xs text-text-tertiary pl-2">
                +{table.issues.length - 3} more issue{table.issues.length - 3 !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {/* No Issues State */}
        {!table.isLoading && table.issues.length === 0 && table.hasProfile && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>No issues detected</span>
          </div>
        )}

        {/* Fix Issues Button */}
        {!table.isLoading && table.issues.length > 0 && onFixIssues && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onFixIssues()
            }}
            className="mt-3 w-full text-xs font-medium text-accent-green hover:bg-accent-green/10 py-1.5 rounded-lg transition-colors"
          >
            View Suggestions
          </button>
        )}
      </div>
    </div>
  )
}
