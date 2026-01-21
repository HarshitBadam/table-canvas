/**
 * Shared Column Statistics Components
 * 
 * Reusable components for displaying column-level statistics.
 * Used in Dashboard and can be used elsewhere.
 */

import type { ColumnProfile } from '@/lib/types'

// ============================================================================
// Helper Functions
// ============================================================================

export function formatStat(value: number | undefined): string {
  if (value === undefined || value === null) return '—'
  if (Number.isNaN(value)) return '—'
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toFixed(2)
}

export function formatDateSpan(minDate: number, maxDate: number): string {
  const diffMs = maxDate - minDate
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 1) return '< 1 day'
  if (diffDays < 30) return `${diffDays}d`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
  const years = Math.floor(diffDays / 365)
  const months = Math.floor((diffDays % 365) / 30)
  return months > 0 ? `${years}y ${months}mo` : `${years}y`
}

export function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toLocaleString()
}

// Type badge colors - refined, muted tones
export function getTypeBadgeStyle(type: string): { bg: string; text: string } {
  const t = type.toLowerCase()
  if (t === 'number' || t === 'integer' || t === 'float' || t === 'double') {
    return { bg: 'bg-blue-50 dark:bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400' }
  }
  if (t === 'string' || t === 'varchar' || t === 'text') {
    return { bg: 'bg-cyan-50 dark:bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400' }
  }
  if (t === 'boolean' || t === 'bool') {
    return { bg: 'bg-amber-50 dark:bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400' }
  }
  if (t === 'date' || t === 'datetime' || t === 'timestamp') {
    return { bg: 'bg-purple-50 dark:bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' }
  }
  return { bg: 'bg-gray-100 dark:bg-gray-500/15', text: 'text-gray-500 dark:text-gray-400' }
}

// ============================================================================
// Stat Row Component
// ============================================================================

export function StatRow({ 
  label, 
  value, 
  secondary 
}: { 
  label: string
  value: string
  secondary?: string 
}) {
  return (
    <div className="flex justify-between items-baseline py-1">
      <span className="text-[11px] text-text-tertiary font-medium">{label}</span>
      <span className="text-[11px] font-mono text-text-primary tabular-nums">
        {value}
        {secondary && <span className="text-text-tertiary ml-1.5 font-normal">{secondary}</span>}
      </span>
    </div>
  )
}

// ============================================================================
// Numeric Stats Component
// ============================================================================

export function NumericStats({ profile }: { profile: ColumnProfile }) {
  if (profile.min === undefined && profile.mean === undefined) return null
  return (
    <div className="space-y-0.5">
      <StatRow label="Range" value={`${formatStat(profile.min)} – ${formatStat(profile.max)}`} />
      {profile.mean !== undefined && <StatRow label="Mean" value={formatStat(profile.mean)} />}
      {profile.median !== undefined && <StatRow label="Median" value={formatStat(profile.median)} />}
      {profile.stdDev !== undefined && <StatRow label="Std Dev" value={formatStat(profile.stdDev)} />}
      {profile.iqr !== undefined && <StatRow label="IQR" value={formatStat(profile.iqr)} />}
    </div>
  )
}

// ============================================================================
// String Stats Component
// ============================================================================

export function StringStats({ 
  profile, 
  rowCount 
}: { 
  profile: ColumnProfile
  rowCount: number 
}) {
  const isUnique = profile.cardinalityClass === 'unique'
  const isHighCardinality = profile.cardinalityClass === 'high'
  const topValues = profile.topValues?.slice(0, 4) || []
  
  // For unique fields - show distinct count + sample values
  if (isUnique || isHighCardinality) {
    const samples = topValues.slice(0, 3).map(tv => String(tv.value))
    const sampleText = samples.join(', ') + (topValues.length > 3 ? ' …' : '')
    return (
      <div className="space-y-1.5">
        <StatRow 
          label="Distinct" 
          value={formatNumber(profile.distinctCount)} 
          secondary={isUnique ? "(unique)" : `of ${formatNumber(rowCount)}`} 
        />
        {samples.length > 0 && (
          <div className="text-[11px] text-text-secondary leading-relaxed truncate">
            {sampleText}
          </div>
        )}
      </div>
    )
  }
  
  // For low cardinality (categorical) - show distribution
  if (topValues.length === 0) return null
  return (
    <div className="space-y-1.5">
      <StatRow label="Distinct" value={formatNumber(profile.distinctCount)} />
      <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700/50 space-y-1">
        {topValues.map((tv, i) => {
          const pct = rowCount > 0 ? ((tv.count / rowCount) * 100).toFixed(0) : '0'
          return (
            <div key={i} className="flex justify-between items-center">
              <span className="text-[11px] text-text-secondary truncate max-w-[150px]">{String(tv.value)}</span>
              <span className="text-[10px] font-mono text-text-tertiary tabular-nums">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Boolean Stats Component
// ============================================================================

export function BooleanStats({ profile }: { profile: ColumnProfile }) {
  const topValues = profile.topValues || []
  if (topValues.length === 0) return null
  const trueVal = topValues.find(v => v.value === true || v.value === 'true')
  const falseVal = topValues.find(v => v.value === false || v.value === 'false')
  const total = (trueVal?.count || 0) + (falseVal?.count || 0)
  const truePct = total > 0 ? (trueVal?.count || 0) / total * 100 : 0
  
  return (
    <div className="space-y-2">
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
          style={{ width: `${truePct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px]">
        <span>
          <span className="font-medium text-text-primary">{truePct.toFixed(0)}%</span>
          <span className="text-text-tertiary ml-1">true</span>
        </span>
        <span>
          <span className="font-medium text-text-primary">{(100 - truePct).toFixed(0)}%</span>
          <span className="text-text-tertiary ml-1">false</span>
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Date Stats Component
// ============================================================================

export function DateStats({ profile }: { profile: ColumnProfile }) {
  if (profile.min === undefined || profile.max === undefined) return null
  const min = new Date(profile.min)
  const max = new Date(profile.max)
  return (
    <div className="space-y-0.5">
      <StatRow label="From" value={min.toLocaleDateString()} />
      <StatRow label="To" value={max.toLocaleDateString()} />
      <StatRow label="Span" value={formatDateSpan(profile.min, profile.max)} />
    </div>
  )
}

// ============================================================================
// Column Profile Card Component
// ============================================================================

export function ColumnProfileCard({ 
  column, 
  columnProfile, 
  columnType, 
  rowCount 
}: { 
  column: { id: string; name: string; type: string }
  columnProfile?: ColumnProfile
  columnType: string
  rowCount: number
}) {
  const nullCount = columnProfile?.missingCount ?? 0
  const nullPct = columnProfile?.missingPercent ?? 0
  const typeStyle = getTypeBadgeStyle(columnType)
  
  return (
    <div className="px-4 py-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-text-primary truncate flex-1" title={column.name}>
          {column.name}
        </span>
        <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
          {columnType}
        </span>
      </div>
      
      {/* Meta line */}
      <div className="text-[11px] text-text-tertiary mt-1">
        {formatNumber(rowCount - nullCount)} values
        {nullCount > 0 && (
          <span className={nullPct > 5 ? 'text-amber-600 dark:text-amber-400' : ''}>
            {' · '}{nullPct.toFixed(1)}% null
          </span>
        )}
      </div>
      
      {/* Stats */}
      {columnProfile && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
          {columnType === 'number' && <NumericStats profile={columnProfile} />}
          {columnType === 'string' && <StringStats profile={columnProfile} rowCount={rowCount} />}
          {columnType === 'boolean' && <BooleanStats profile={columnProfile} />}
          {(columnType === 'date' || columnType === 'datetime') && <DateStats profile={columnProfile} />}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Compact Column Stats (for inline display)
// ============================================================================

export function ColumnStatsCompact({
  profile,
  columnType,
  rowCount,
}: {
  profile: ColumnProfile
  columnType: string
  rowCount: number
}) {
  const t = columnType.toLowerCase()
  
  // Numeric columns
  if (t === 'number' || t === 'integer' || t === 'float' || t === 'double') {
    if (profile.min !== undefined && profile.max !== undefined) {
      return (
        <span className="text-text-secondary">
          Range: {formatStat(profile.min)} – {formatStat(profile.max)}
          {profile.mean !== undefined && <span className="ml-2">Avg: {formatStat(profile.mean)}</span>}
        </span>
      )
    }
    return <span className="text-text-tertiary">{profile.distinctCount} distinct values</span>
  }

  // Date columns
  if (t === 'date' || t === 'datetime' || t === 'timestamp') {
    if (profile.min !== undefined && profile.max !== undefined) {
      const minDate = new Date(profile.min).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const maxDate = new Date(profile.max).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      return <span className="text-text-secondary">{minDate} → {maxDate}</span>
    }
    return <span className="text-text-tertiary">{profile.distinctCount} distinct dates</span>
  }

  // Boolean columns
  if (t === 'boolean' || t === 'bool') {
    const topValues = profile.topValues || []
    const trueVal = topValues.find(v => v.value === true || v.value === 'true')
    const falseVal = topValues.find(v => v.value === false || v.value === 'false')
    const total = (trueVal?.count || 0) + (falseVal?.count || 0)
    if (total > 0) {
      const truePct = Math.round((trueVal?.count || 0) / total * 100)
      return <span className="text-text-secondary">{truePct}% true, {100 - truePct}% false</span>
    }
    return <span className="text-text-tertiary">Boolean values</span>
  }

  // String columns
  const isUnique = profile.cardinalityClass === 'unique'
  const isHighCardinality = profile.cardinalityClass === 'high'
  
  if (isUnique) {
    return <span className="text-text-secondary">{profile.distinctCount} unique values (potential ID)</span>
  }
  
  if (!isHighCardinality && profile.topValues && profile.topValues.length > 0) {
    const topThree = profile.topValues.slice(0, 3)
    const preview = topThree.map(tv => `"${tv.value}"`).join(', ')
    return (
      <span className="text-text-secondary">
        {profile.distinctCount} values: {preview}{profile.topValues.length > 3 ? '...' : ''}
      </span>
    )
  }

  return <span className="text-text-tertiary">{profile.distinctCount} distinct values</span>
}
