/**
 * Tables List Section Component
 * 
 * Simple, scannable list of all tables with status indicators.
 * Replaces the complex "Data Quality by Table" cards.
 */

import type { TableQualityMetrics } from '../useDashboardData'

interface TablesListSectionProps {
  tableMetrics: TableQualityMetrics[]
  onOpenTable: (tableId: string) => void
}

export function TablesListSection({ 
  tableMetrics, 
  onOpenTable,
}: TablesListSectionProps) {
  if (tableMetrics.length === 0) {
    return null
  }

  // Sort: derived tables after source tables
  const sortedTables = [...tableMetrics].sort((a, b) => {
    if (a.tableKind === b.tableKind) return a.tableName.localeCompare(b.tableName)
    return a.tableKind === 'source_table' ? -1 : 1
  })

  return (
    <div className="bg-surface rounded-xl border border-border">
      {/* Section Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Your Data</h3>
      </div>

      {/* Tables List */}
      <div className="divide-y divide-border">
        {sortedTables.map((table) => (
          <button
            key={table.tableId}
            onClick={() => onOpenTable(table.tableId)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-secondary transition-colors text-left group"
          >
            {/* Table Icon */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              table.tableKind === 'source_table' 
                ? 'bg-node-source/10 text-node-source-border' 
                : 'bg-node-derived/10 text-node-derived-border'
            }`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
              </svg>
            </div>

            {/* Table Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary truncate group-hover:text-accent-green transition-colors">
                  {table.tableName}
                </span>
                {table.tableKind === 'derived_table' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-node-derived/10 text-node-derived-border font-medium">
                    Derived
                  </span>
                )}
              </div>
              <div className="text-xs text-text-tertiary">
                {table.rowCount.toLocaleString()} rows, {table.columnCount} columns
              </div>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {table.isLoading ? (
                <div className="w-4 h-4 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
              ) : table.issueCount > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 font-medium">
                  {table.issueCount} issue{table.issueCount !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-xs text-green-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
              
              {/* Arrow */}
              <svg className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
