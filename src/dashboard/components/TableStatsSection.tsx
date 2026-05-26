import { useState } from 'react'
import { useProfilingStore } from '@/profiling/profiler'
import type { TableQualityMetrics } from '../useDashboardData'
import type { ColumnProfile, TableSchema } from '@/types'
import { useProjectStore } from '@/state/projectStore'

interface TableStatsSectionProps {
  tableMetrics: TableQualityMetrics[]
  onOpenTable: (tableId: string) => void
}

export function TableStatsSection({ 
  tableMetrics, 
  onOpenTable,
}: TableStatsSectionProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(() => {
    // Start with first table expanded
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

  // Group tables
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
          onOpenTable={onOpenTable}
        />
      )}

      {derivedTables.length > 0 && (
        <TableSection
          title="Derived Tables"
          subtitle="Computed from joins and transforms"
          tables={derivedTables}
          expandedTables={expandedTables}
          onToggle={toggleExpanded}
          onOpenTable={onOpenTable}
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
  onOpenTable,
}: {
  title: string
  subtitle: string
  tables: TableQualityMetrics[]
  expandedTables: Set<string>
  onToggle: (tableId: string) => void
  onOpenTable: (tableId: string) => void
}) {
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
            onOpen={() => onOpenTable(table.tableId)}
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
      {/* Header */}
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


function ColumnList({
  schema,
  profile,
  rowCount,
}: {
  schema: TableSchema
  profile?: { columns: ColumnProfile[] }
  rowCount: number
}) {
  // Build a map of column profiles by ID AND by name for fallback matching
  const profileMap = new Map<string, ColumnProfile>()
  const profileByName = new Map<string, ColumnProfile>()
  
  if (profile?.columns) {
    for (const cp of profile.columns) {
      profileMap.set(cp.columnId, cp)
      // Also try to match by column name if available
      if (cp.columnId) {
        profileByName.set(cp.columnId.toLowerCase(), cp)
      }
    }
  }

  return (
    <div className="divide-y divide-border">
      {schema.columns.map((col, index) => {
        // Try to find profile by ID first, then by name
        let colProfile = profileMap.get(col.id)
        if (!colProfile) {
          colProfile = profileByName.get(col.name.toLowerCase())
        }
        // Also try matching by index if profile columns exist
        if (!colProfile && profile?.columns?.[index]) {
          colProfile = profile.columns[index]
        }
        
        return (
          <ColumnRow 
            key={col.id} 
            column={col} 
            profile={colProfile}
            rowCount={rowCount}
          />
        )
      })}
    </div>
  )
}


function ColumnRow({
  column,
  profile,
  rowCount,
}: {
  column: { id: string; name: string; type: string }
  profile?: ColumnProfile
  rowCount: number
}) {
  const t = column.type.toLowerCase()
  const isNumeric = ['number', 'integer', 'float', 'double', 'decimal'].includes(t)
  const isString = ['string', 'varchar', 'text', 'char'].includes(t)
  const isBoolean = ['boolean', 'bool'].includes(t)
  const isDate = ['date', 'datetime', 'timestamp', 'time'].includes(t)

  // Compute completeness
  const completeness = profile ? Math.round(100 - (profile.missingPercent || 0)) : 100
  const missingCount = profile?.missingCount || 0

  return (
    <div className="px-4 py-3">
      {/* Column header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{column.name}</span>
          <TypeBadge type={column.type} />
        </div>
        <div className="flex items-center gap-2">
          {missingCount > 0 && (
            <span className="text-xs text-text-tertiary">
              {missingCount.toLocaleString()} missing
            </span>
          )}
          <CompletenessBar value={completeness} />
        </div>
      </div>

      {/* Statistics grid - ALWAYS show something */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        {profile ? (
          <>
            {isNumeric && <NumericStats profile={profile} rowCount={rowCount} />}
            {isString && <StringStats profile={profile} rowCount={rowCount} />}
            {isBoolean && <BooleanStats profile={profile} />}
            {isDate && <DateStats profile={profile} />}
            
            {/* Always show distinct count for any type */}
            {profile.distinctCount !== undefined && (
              <Stat label="Distinct Values" value={profile.distinctCount.toLocaleString()} />
            )}
          </>
        ) : (
          // No profile data - show basic info
          <Stat label="Values" value={rowCount.toLocaleString()} subtext="(profiling pending)" />
        )}
      </div>
    </div>
  )
}


function Stat({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium text-text-primary">
        {value}
      </div>
      {subtext && (
        <div className="text-[10px] text-text-tertiary">{subtext}</div>
      )}
    </div>
  )
}


function TypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase()
  let color = 'bg-surface-tertiary text-text-secondary'
  
  if (['number', 'integer', 'float', 'double', 'decimal'].includes(t)) {
    color = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  } else if (['string', 'varchar', 'text', 'char'].includes(t)) {
    color = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  } else if (['boolean', 'bool'].includes(t)) {
    color = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  } else if (['date', 'datetime', 'timestamp', 'time'].includes(t)) {
    color = 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
  }

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>
      {type}
    </span>
  )
}


function CompletenessBar({ value }: { value: number }) {
  const color = value >= 95 ? 'bg-green-500' : value >= 80 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = value >= 95 
    ? 'text-green-600 dark:text-green-400' 
    : value >= 80 
    ? 'text-amber-600 dark:text-amber-400' 
    : 'text-red-600 dark:text-red-400'

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-surface-tertiary rounded-sm overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${textColor}`}>{value}%</span>
    </div>
  )
}


function NumericStats({ profile, rowCount }: { profile: ColumnProfile; rowCount: number }) {
  const fmt = (n: number | undefined) => {
    if (n === undefined || n === null) return '—'
    if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`
    if (Number.isInteger(n)) return n.toLocaleString()
    return n.toFixed(2)
  }

  // Check if it's likely an ID
  const isId = profile.isKeyCandidate || 
    profile.distinctCount === rowCount ||
    profile.semanticHints?.includes('id')
  
  if (isId) {
    return (
      <Stat label="Role" value="Identifier" subtext={`${profile.distinctCount?.toLocaleString() || rowCount} unique`} />
    )
  }

  return (
    <>
      <Stat label="Minimum" value={fmt(profile.min)} />
      <Stat label="Maximum" value={fmt(profile.max)} />
      <Stat label="Average" value={fmt(profile.mean)} />
      {profile.stdDev !== undefined && (
        <Stat label="Std Dev" value={fmt(profile.stdDev)} />
      )}
    </>
  )
}


function StringStats({ profile, rowCount }: { profile: ColumnProfile; rowCount: number }) {
  const isUnique = profile.distinctCount === rowCount && rowCount > 0
  const isId = profile.isKeyCandidate || profile.semanticHints?.includes('id')
  
  if (isUnique || isId) {
    const sample = profile.topValues?.[0]?.value
    return (
      <Stat 
        label="Role" 
        value="Identifier" 
        subtext={sample ? `e.g. ${String(sample).slice(0, 20)}` : undefined}
      />
    )
  }

  // Show distinct count
  const distinctPct = rowCount > 0 ? Math.round((profile.distinctCount / rowCount) * 100) : 0
  
  // Get top values
  const topValues = profile.topValues?.slice(0, 5) || []
  
  return (
    <>
      <Stat 
        label="Distinct" 
        value={profile.distinctCount?.toLocaleString() || '—'} 
        subtext={`${distinctPct}% of ${rowCount}`}
      />
      {topValues.length > 0 && (
        <div className="col-span-2 lg:col-span-3">
          <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
            Top Values
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topValues.map((tv, i) => {
              const pct = rowCount > 0 ? Math.round((tv.count / rowCount) * 100) : 0
              return (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-secondary text-xs">
                  <span className="text-text-primary font-medium">{String(tv.value).slice(0, 20)}</span>
                  <span className="text-text-tertiary">({pct}%)</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}


function BooleanStats({ profile }: { profile: ColumnProfile }) {
  const topValues = profile.topValues || []
  const trueVal = topValues.find(v => v.value === true || v.value === 'true' || v.value === 1)
  const falseVal = topValues.find(v => v.value === false || v.value === 'false' || v.value === 0)
  const total = (trueVal?.count || 0) + (falseVal?.count || 0)
  
  if (total === 0) {
    return <Stat label="Values" value="No data" />
  }
  
  const truePct = Math.round((trueVal?.count || 0) / total * 100)
  const falsePct = 100 - truePct

  return (
    <>
      <Stat label="True" value={`${truePct}%`} subtext={`${(trueVal?.count || 0).toLocaleString()} values`} />
      <Stat label="False" value={`${falsePct}%`} subtext={`${(falseVal?.count || 0).toLocaleString()} values`} />
    </>
  )
}


function DateStats({ profile }: { profile: ColumnProfile }) {
  const fmtDate = (val: number | string | undefined) => {
    if (val === undefined || val === null) return '—'
    const d = new Date(val)
    if (isNaN(d.getTime())) return String(val).slice(0, 10)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Calculate span
  let spanText = ''
  if (profile.min !== undefined && profile.max !== undefined) {
    const minDate = new Date(profile.min)
    const maxDate = new Date(profile.max)
    const diffMs = maxDate.getTime() - minDate.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 30) spanText = `${diffDays} days`
    else if (diffDays < 365) spanText = `${Math.round(diffDays / 30)} months`
    else spanText = `${(diffDays / 365).toFixed(1)} years`
  }

  return (
    <>
      <Stat label="Earliest" value={fmtDate(profile.min)} />
      <Stat label="Latest" value={fmtDate(profile.max)} />
      {spanText && <Stat label="Span" value={spanText} />}
    </>
  )
}
