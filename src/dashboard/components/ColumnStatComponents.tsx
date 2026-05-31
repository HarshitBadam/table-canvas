import type { ColumnProfile } from '@/types'
import { formatNumber } from '@/lib/utils'

function fmtCompact(n: number | undefined | null): string {
  return n === undefined || n === null ? '—' : formatNumber(n, { compact: true })
}

export function Stat({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
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



export function CompletenessBar({
  value,
  barWidth = 'w-20',
  barHeight = 'h-1.5',
}: {
  value: number
  /** Tailwind width class for the track. @default 'w-20' */
  barWidth?: string
  /** Tailwind height class for the track. @default 'h-1.5' */
  barHeight?: string
}) {
  const color = value >= 95 ? 'bg-green-500' : value >= 80 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = value >= 95 
    ? 'text-green-600 dark:text-green-400' 
    : value >= 80 
    ? 'text-amber-600 dark:text-amber-400' 
    : 'text-red-600 dark:text-red-400'

  return (
    <div className="flex items-center gap-2">
      <div className={`${barWidth} ${barHeight} bg-surface-tertiary rounded-sm overflow-hidden`}>
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${textColor}`}>{value}%</span>
    </div>
  )
}


export function NumericStats({ profile, rowCount }: { profile: ColumnProfile; rowCount: number }) {
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
      <Stat label="Minimum" value={fmtCompact(profile.min)} />
      <Stat label="Maximum" value={fmtCompact(profile.max)} />
      <Stat label="Average" value={fmtCompact(profile.mean)} />
      {profile.stdDev !== undefined && (
        <Stat label="Std Dev" value={fmtCompact(profile.stdDev)} />
      )}
    </>
  )
}


export function StringStats({ profile, rowCount }: { profile: ColumnProfile; rowCount: number }) {
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

  const distinctPct = rowCount > 0 ? Math.round((profile.distinctCount / rowCount) * 100) : 0
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


export function BooleanStats({ profile }: { profile: ColumnProfile }) {
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


export function DateStats({ profile }: { profile: ColumnProfile }) {
  const fmtDate = (val: number | string | undefined) => {
    if (val === undefined || val === null) return '—'
    const d = new Date(val)
    if (isNaN(d.getTime())) return String(val).slice(0, 10)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

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
