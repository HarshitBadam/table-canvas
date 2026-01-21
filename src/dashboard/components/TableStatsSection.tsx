/**
 * Table Stats Section Component
 * 
 * Expandable table list with column-level statistics.
 * Shows min, max, avg, distributions for each column.
 */

import { useState } from 'react'
import { useProfilingStore } from '@/profiling/profiler'
import type { TableQualityMetrics } from '../useDashboardData'
import type { ColumnProfile, TableSchema } from '@/lib/types'
import { useProjectStore } from '@/state/projectStore'

interface TableStatsSectionProps {
  tableMetrics: TableQualityMetrics[]
  onOpenTable: (tableId: string) => void
}

export function TableStatsSection({ 
  tableMetrics, 
  onOpenTable,
}: TableStatsSectionProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

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
    <div className="bg-surface rounded-xl border border-border">
      {/* Section Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Your Data</h3>
      </div>

      {/* Tables List */}
      <div className="divide-y divide-border">
        {sortedTables.map((table) => (
          <TableRow
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

// Individual table row with expandable stats
function TableRow({
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

  return (
    <div>
      {/* Main Row */}
      <div className="flex items-center">
        {/* Expand Toggle */}
        <button
          onClick={onToggle}
          className="px-3 py-3 hover:bg-surface-secondary/50 transition-colors"
        >
          <svg 
            className={`w-4 h-4 text-text-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Table Info - Clickable to navigate */}
        <button
          onClick={onOpen}
          className="flex-1 py-3 pr-4 flex items-center gap-3 hover:bg-surface-secondary/50 transition-colors text-left group"
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

          {/* Name and Meta */}
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

          {/* Status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {table.isLoading ? (
              <div className="w-4 h-4 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
            ) : table.issueCount > 0 ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 font-medium">
                {table.issueCount} issue{table.issueCount !== 1 ? 's' : ''}
              </span>
            ) : (
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Expanded Column Stats */}
      {isExpanded && (
        <div className="bg-surface-secondary/30 border-t border-border">
          {profile && schema ? (
            <div className="divide-y divide-border/50">
              {schema.columns.map((col) => {
                const colProfile = profile.columns.find(cp => cp.columnId === col.id)
                return (
                  <ColumnStatsRow 
                    key={col.id} 
                    column={col} 
                    profile={colProfile}
                    rowCount={table.rowCount}
                  />
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">
              {table.isLoading ? 'Loading column stats...' : 'No profile data available'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Individual column stats row
function ColumnStatsRow({
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

  return (
    <div className="px-4 py-2.5 flex items-start gap-4">
      {/* Column Name & Type */}
      <div className="w-32 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-primary truncate" title={column.name}>
            {column.name}
          </span>
        </div>
        <span className={`text-[10px] font-medium uppercase px-1 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
          {column.type}
        </span>
      </div>

      {/* Stats */}
      <div className="flex-1 text-xs text-text-secondary">
        {profile ? (
          <ColumnStatsSummary 
            profile={profile} 
            columnType={column.type} 
            rowCount={rowCount}
          />
        ) : (
          <span className="text-text-tertiary">—</span>
        )}
      </div>

      {/* Null indicator */}
      {nullCount > 0 && (
        <div className={`text-xs flex-shrink-0 ${nullPct > 5 ? 'text-orange-600' : 'text-text-tertiary'}`}>
          {nullPct.toFixed(0)}% null
        </div>
      )}
    </div>
  )
}

// Summary stats based on column type
function ColumnStatsSummary({
  profile,
  columnType,
  rowCount,
}: {
  profile: ColumnProfile
  columnType: string
  rowCount: number
}) {
  // Numeric columns
  if (columnType === 'number') {
    if (profile.min !== undefined && profile.max !== undefined) {
      const parts: string[] = []
      parts.push(`Range: ${formatNum(profile.min)} – ${formatNum(profile.max)}`)
      if (profile.mean !== undefined) {
        parts.push(`Avg: ${formatNum(profile.mean)}`)
      }
      return <span>{parts.join(' · ')}</span>
    }
    return <span>{profile.distinctCount} distinct values</span>
  }

  // Date columns
  if (columnType === 'date' || columnType === 'datetime') {
    if (profile.min !== undefined && profile.max !== undefined) {
      const minDate = formatDate(profile.min)
      const maxDate = formatDate(profile.max)
      return <span>{minDate} → {maxDate}</span>
    }
    return <span>{profile.distinctCount} distinct dates</span>
  }

  // Boolean columns
  if (columnType === 'boolean') {
    const topValues = profile.topValues || []
    const trueVal = topValues.find(v => v.value === true || v.value === 'true')
    const falseVal = topValues.find(v => v.value === false || v.value === 'false')
    const total = (trueVal?.count || 0) + (falseVal?.count || 0)
    if (total > 0) {
      const truePct = Math.round((trueVal?.count || 0) / total * 100)
      return <span>{truePct}% true, {100 - truePct}% false</span>
    }
    return <span>Boolean values</span>
  }

  // String columns
  const isUnique = profile.cardinalityClass === 'unique'
  const isHighCardinality = profile.cardinalityClass === 'high'
  
  if (isUnique) {
    return <span>{profile.distinctCount} unique values (potential ID)</span>
  }
  
  if (!isHighCardinality && profile.topValues && profile.topValues.length > 0) {
    const topThree = profile.topValues.slice(0, 3)
    const preview = topThree.map(tv => `"${tv.value}"`).join(', ')
    return <span>{profile.distinctCount} values: {preview}{profile.topValues.length > 3 ? '...' : ''}</span>
  }

  return <span>{profile.distinctCount} distinct values</span>
}

// Helper: Format number for display
function formatNum(val: unknown): string {
  if (typeof val !== 'number') return String(val)
  if (Math.abs(val) >= 1000000) return `${(val / 1000000).toFixed(1)}M`
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}K`
  if (Number.isInteger(val)) return val.toLocaleString()
  return val.toFixed(2)
}

// Helper: Format date for display
function formatDate(val: unknown): string {
  if (typeof val === 'number') {
    const date = new Date(val)
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }
  if (typeof val === 'string') {
    const date = new Date(val)
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    return val
  }
  return String(val)
}

// Helper: Get type badge style
function getTypeBadgeStyle(type: string): { bg: string; text: string } {
  switch (type?.toLowerCase()) {
    case 'number':
    case 'integer':
    case 'float':
      return { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' }
    case 'string':
    case 'text':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' }
    case 'date':
    case 'datetime':
      return { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400' }
    case 'boolean':
      return { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' }
    default:
      return { bg: 'bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400' }
  }
}
