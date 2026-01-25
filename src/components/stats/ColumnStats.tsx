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

/**
 * Detect if a numeric column looks like an ID (unique values, sequential pattern)
 */
function isLikelyNumericId(profile: ColumnProfile, rowCount?: number): boolean {
  // If it's marked as a key candidate, it's likely an ID
  if (profile.isKeyCandidate) return true
  // If distinct count equals row count, it's unique (likely ID)
  if (rowCount && profile.distinctCount === rowCount) return true
  // If semantic hints include 'id', it's likely an ID
  if (profile.semanticHints?.includes('id')) return true
  return false
}

/**
 * Detect significant outliers and return human-readable warnings
 * Only flags outliers that are very extreme (>2x IQR beyond bounds)
 */
function getOutlierWarnings(profile: ColumnProfile): string[] {
  const warnings: string[] = []
  
  // Skip if no IQR data or IQR is zero (no spread)
  if (!profile.iqr || profile.iqr === 0 || profile.q1 === undefined || profile.q3 === undefined) {
    return warnings
  }
  
  const lowerBound = profile.q1 - 1.5 * profile.iqr
  const upperBound = profile.q3 + 1.5 * profile.iqr
  
  // Only flag if outlier is extremely beyond the bound (>2x IQR distance)
  if (profile.min !== undefined && profile.min < lowerBound) {
    const distance = lowerBound - profile.min
    const extremeRatio = distance / profile.iqr
    if (extremeRatio > 2) {
      warnings.push(`Extreme minimum: ${formatStat(profile.min)}`)
    }
  }
  
  if (profile.max !== undefined && profile.max > upperBound) {
    const distance = profile.max - upperBound
    const extremeRatio = distance / profile.iqr
    if (extremeRatio > 2) {
      warnings.push(`Extreme maximum: ${formatStat(profile.max)}`)
    }
  }
  
  return warnings
}

export function NumericStats({ profile, rowCount }: { profile: ColumnProfile; rowCount?: number }) {
  if (profile.min === undefined && profile.mean === undefined) return null
  
  // Check if this looks like an ID column
  const isId = isLikelyNumericId(profile, rowCount)
  
  // If it's an ID, just show it's an identifier
  if (isId) {
    return (
      <span className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        Identifier
      </span>
    )
  }
  
  // Get outlier warnings
  const outlierWarnings = getOutlierWarnings(profile)
  
  // Inline stat display for table layout
  const stats: string[] = []
  if (profile.min !== undefined && profile.max !== undefined) {
    stats.push(`Range: ${formatStat(profile.min)}–${formatStat(profile.max)}`)
  }
  if (profile.mean !== undefined) {
    stats.push(`Avg: ${formatStat(profile.mean)}`)
  }
  
  return (
    <div>
      <span className="text-text-secondary">
        {stats.join(' · ')}
      </span>
      {outlierWarnings.length > 0 && (
        <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">
          {outlierWarnings[0]}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// String Stats Component
// ============================================================================

/**
 * Check if values look like an ID pattern (e.g., PROD001, ORD-123, etc.)
 */
function looksLikeIdPattern(values: Array<{ value: unknown }>): boolean {
  if (values.length === 0) return false
  const samples = values.slice(0, 3).map(v => String(v.value))
  // Check if values have consistent prefix + number pattern
  const hasPrefix = samples.every(s => /^[A-Z]{2,}[\d\-_]/.test(s))
  const hasNumericSuffix = samples.every(s => /\d+$/.test(s))
  return hasPrefix || hasNumericSuffix
}

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
  
  // Check if distinct count equals row count (obviously unique)
  const isObviouslyUnique = profile.distinctCount === rowCount && rowCount > 0
  
  // Check if it looks like an ID column
  const looksLikeId = profile.isKeyCandidate || 
    profile.semanticHints?.includes('id') || 
    looksLikeIdPattern(topValues)
  
  // For ID-like columns - just show it's an identifier
  if ((isUnique || isObviouslyUnique) && looksLikeId) {
    const sample = topValues[0] ? String(topValues[0].value) : null
    return (
      <span className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        Identifier{sample ? ` (${sample})` : ''}
      </span>
    )
  }
  
  // For unique but not ID-like (e.g., names, descriptions)
  if (isUnique || isObviouslyUnique) {
    return <span className="text-text-tertiary">All unique</span>
  }
  
  if (isHighCardinality) {
    return <span className="text-text-secondary">{formatNumber(profile.distinctCount)} distinct values</span>
  }
  
  // For low cardinality (categorical) - show values inline
  if (topValues.length === 0) return null
  
  // Show categories inline
  const categoryText = topValues.slice(0, 3).map(tv => String(tv.value)).join(', ')
  const moreCount = profile.distinctCount > 3 ? profile.distinctCount - 3 : 0
  
  return (
    <span className="text-text-secondary">
      {profile.distinctCount} values: {categoryText}{moreCount > 0 ? `, +${moreCount}` : ''}
    </span>
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
  
  // Check for imbalance (>95% one value)
  const isAllSame = truePct === 100 || truePct === 0
  
  if (isAllSame) {
    return (
      <span className="text-amber-600 dark:text-amber-400">
        All {truePct === 100 ? 'true' : 'false'}
      </span>
    )
  }
  
  return (
    <span className="text-text-secondary">
      {truePct.toFixed(0)}% true · {(100 - truePct).toFixed(0)}% false
    </span>
  )
}

// ============================================================================
// Date Stats Component
// ============================================================================

export function DateStats({ profile }: { profile: ColumnProfile }) {
  if (profile.min === undefined || profile.max === undefined) return null
  const min = new Date(profile.min)
  const max = new Date(profile.max)
  const now = new Date()
  
  // Format as short date
  const formatShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  // Check for issues
  const hasFuture = max > now
  
  return (
    <span className="text-text-secondary">
      {formatShort(min)} → {formatShort(max)}
      {hasFuture && <span className="ml-1 text-amber-600 dark:text-amber-400">(future dates)</span>}
    </span>
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
}: {
  profile: ColumnProfile
  columnType: string
  rowCount?: number
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
