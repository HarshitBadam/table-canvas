import { useState } from 'react'
import { useProfilingStore } from '@/lib/profiling'
import type { TableQualityMetrics } from '../useDashboardData'
import type { TableSchema } from '@/types'
import { useProjectStore } from '@/state/projectStore'
import { useNavigation } from '@/layout/NavigationContext'
import { ColumnList } from './ColumnList'

interface TableStatsSectionProps {
  tableMetrics: TableQualityMetrics[]
}

export function TableStatsSection({ 
  tableMetrics, 
}: TableStatsSectionProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(() => {
    const first = tableMetrics[0]?.tableId
    return first ? new Set([first]) : new Set()
  })

  if (tableMetrics.length === 0) return null

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

  const sourceTables = tableMetrics.filter(t => t.tableKind === 'source_table')
  const derivedTables = tableMetrics.filter(t => t.tableKind === 'derived_table')

  return (
    <div className="space-y-6">
      {sourceTables.length > 0 && (
        <TableSection
          title="Source Tables"
          subtitle="Imported data"
          tables={sourceTables}
          expandedTables={expandedTables}
          onToggle={toggleExpanded}
        />
      )}

      {derivedTables.length > 0 && (
        <TableSection
          title="Derived Tables"
          subtitle="Computed from joins and transforms"
          tables={derivedTables}
          expandedTables={expandedTables}
          onToggle={toggleExpanded}
        />
      )}
    </div>
  )
}


function TableSection({
  title,
  subtitle,
  tables,
  expandedTables,
  onToggle,
}: {
  title: string
  subtitle: string
  tables: TableQualityMetrics[]
  expandedTables: Set<string>
  onToggle: (tableId: string) => void
}) {
  const { openTable } = useNavigation()
  return (
    <section>
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="text-xs text-text-tertiary">{subtitle}</p>
      </header>

      <div className="space-y-2">
        {tables.map((table) => (
          <TableCard
            key={table.tableId}
            table={table}
            isExpanded={expandedTables.has(table.tableId)}
            onToggle={() => onToggle(table.tableId)}
            onOpen={() => openTable(table.tableId)}
          />
        ))}
      </div>
    </section>
  )
}


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

  return (
    <div className="table-card bg-surface rounded border border-border shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <svg 
            className={`w-4 h-4 text-text-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{table.tableName}</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {table.rowCount.toLocaleString()} rows · {table.columnCount} columns · {table.freshnessLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {table.issueCount > 0 ? (
            <span className="px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
              {table.issueCount} issue{table.issueCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium">
              Clean
            </span>
          )}
          
          <button
            onClick={(e) => { e.stopPropagation(); onOpen() }}
            className="p-1.5 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary"
            title="Open table"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      </button>

      {/* Column Details - Always rendered for PDF export, hidden via CSS when collapsed */}
      {schema && (
        <div 
          className={`border-t border-border table-card-content ${isExpanded ? '' : 'hidden'}`}
          data-expanded={isExpanded}
        >
          <ColumnList 
            schema={schema} 
            profile={profile} 
            rowCount={table.rowCount}
          />
        </div>
      )}
    </div>
  )
}
