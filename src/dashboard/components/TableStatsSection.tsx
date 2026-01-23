/**
 * Your Data Section Component
 * 
 * Rich, collapsible table cards with detailed column statistics.
 * Each table is a separate card with spacing between them.
 */

import { useState } from 'react'
import { useProfilingStore } from '@/profiling/profiler'
import type { TableQualityMetrics } from '../useDashboardData'
import type { ColumnProfile, TableSchema } from '@/lib/types'
import { useProjectStore } from '@/state/projectStore'
import {
  NumericStats,
  StringStats,
  BooleanStats,
  DateStats,
  getTypeBadgeStyle,
  formatNumber,
} from '@/components/stats'

interface TableStatsSectionProps {
  tableMetrics: TableQualityMetrics[]
  onOpenTable: (tableId: string) => void
}

export function TableStatsSection({ 
  tableMetrics, 
  onOpenTable,
}: TableStatsSectionProps) {
  // Start with first table expanded by default
  const [expandedTables, setExpandedTables] = useState<Set<string>>(() => {
    if (tableMetrics.length > 0) {
      return new Set([tableMetrics[0].tableId])
    }
    return new Set()
  })

  if (tableMetrics.length === 0) {
    return null
  }

  const toggleExpanded = (tableId: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev)
      if (next.has(tableId)) {
        next.delete(tableId)
      } else {
        next.add(tableId)
      }
      return next
    })
  }

  // Sort: source tables first, then derived
  const sortedTables = [...tableMetrics].sort((a, b) => {
    if (a.tableKind === b.tableKind) return a.tableName.localeCompare(b.tableName)
    return a.tableKind === 'source_table' ? -1 : 1
  })

  return (
    <div>
      {/* Section Header */}
      <h3 className="text-sm font-semibold text-text-primary mb-4">Your Data</h3>

      {/* Separate Table Cards */}
      <div className="space-y-4">
        {sortedTables.map((table) => (
          <TableCard
            key={table.tableId}
            table={table}
            isExpanded={expandedTables.has(table.tableId)}
            onToggle={() => toggleExpanded(table.tableId)}
            onOpen={() => onOpenTable(table.tableId)}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Table Card Component - Self-contained with border/shadow
// ============================================================================

function TableCard({
  table,
  isExpanded,
  onToggle,
  onOpen,
}: {
  table: TableQualityMetrics
  isExpanded: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const profiles = useProfilingStore((state) => state.profiles)
  const nodes = useProjectStore((state) => state.nodes)
  
  const profile = profiles[table.tableId]
  const node = nodes[table.tableId]
  const schema = node && 'schema' in node ? (node as { schema?: TableSchema }).schema : undefined

  const isSource = table.tableKind === 'source_table'

  return (
    <div 
      className="bg-surface rounded-xl border border-border overflow-hidden transition-shadow hover:shadow-md"
    >
      {/* Card Header - Always visible */}
      <div 
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-surface-secondary/30 transition-colors"
        onClick={onToggle}
      >
        {/* Expand/Collapse Toggle */}
        <button
          className="flex-shrink-0 p-0.5 rounded hover:bg-surface-secondary transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
        >
          <svg 
            className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Table Icon */}
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          ${isSource 
            ? 'bg-[#217346] shadow-sm shadow-[#217346]/20' 
            : 'bg-violet-500 shadow-sm shadow-violet-500/20'
          }
        `}>
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
          </svg>
        </div>

        {/* Table Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">
              {table.tableName}
            </span>
            {!isSource && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium">
                Derived
              </span>
            )}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {isSource ? 'Source' : 'Derived'} · {formatNumber(table.rowCount)} rows · {table.columnCount} columns
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {table.isLoading ? (
            <div className="w-4 h-4 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
          ) : table.issueCount > 0 ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
              {table.issueCount} issue{table.issueCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Clean
            </span>
          )}
          
          {/* Open in Canvas button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            className="p-2 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors"
            title="Open in Canvas"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Content - Column Stats */}
      {isExpanded && (
        <div className="border-t border-border bg-surface-secondary/20">
          {profile && schema ? (
            <ColumnStatsList 
              schema={schema} 
              profile={profile} 
              rowCount={table.rowCount} 
            />
          ) : (
            <div className="px-5 py-8 text-center">
              {table.isLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
                  <span className="text-sm text-text-tertiary">Loading statistics...</span>
                </div>
              ) : (
                <span className="text-sm text-text-tertiary">No profile data available</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Column Stats List
// ============================================================================

function ColumnStatsList({
  schema,
  profile,
  rowCount,
}: {
  schema: TableSchema
  profile: { columns: ColumnProfile[] }
  rowCount: number
}) {
  return (
    <div className="px-4 py-4">
      <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3">
        Columns ({schema.columns.length})
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {schema.columns.map((col) => {
          const colProfile = profile.columns.find(cp => cp.columnId === col.id)
          return (
            <ColumnStatsCard 
              key={col.id} 
              column={col} 
              profile={colProfile}
              rowCount={rowCount}
            />
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Column Stats Card
// ============================================================================

function ColumnStatsCard({
  column,
  profile,
  rowCount,
}: {
  column: { id: string; name: string; type: string }
  profile?: ColumnProfile
  rowCount: number
}) {
  const typeStyle = getTypeBadgeStyle(column.type)
  const nullCount = profile?.missingCount ?? 0
  const nullPct = profile?.missingPercent ?? 0
  const t = column.type.toLowerCase()

  // Determine column type category
  const isNumeric = t === 'number' || t === 'integer' || t === 'float' || t === 'double'
  const isString = t === 'string' || t === 'varchar' || t === 'text'
  const isBoolean = t === 'boolean' || t === 'bool'
  const isDate = t === 'date' || t === 'datetime' || t === 'timestamp'

  return (
    <div className="bg-white dark:bg-gray-800/50 rounded-lg border border-border/50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-text-primary truncate" title={column.name}>
            {column.name}
          </span>
          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
            {column.type}
          </span>
        </div>
        {nullCount > 0 && (
          <span className={`text-[11px] font-medium ${nullPct > 10 ? 'text-orange-600 dark:text-orange-400' : 'text-text-tertiary'}`}>
            {nullPct.toFixed(0)}% null
          </span>
        )}
      </div>

      {/* Stats Content */}
      {profile ? (
        <div className="mt-2">
          {isNumeric && <NumericStats profile={profile} />}
          {isString && <StringStats profile={profile} rowCount={rowCount} />}
          {isBoolean && <BooleanStats profile={profile} />}
          {isDate && <DateStats profile={profile} />}
        </div>
      ) : (
        <div className="text-[11px] text-text-tertiary">
          {formatNumber(rowCount)} values
        </div>
      )}
    </div>
  )
}
