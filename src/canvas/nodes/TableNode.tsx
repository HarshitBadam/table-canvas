import { memo, useCallback, useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { TableSchema, CacheInfo, ColumnProfile, NodeUI, NodeViewMode, CellValue, ViewFilterConfig } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import type { ProfileResult } from '@/engine/types'
import { MiniTableView } from './MiniTableView'

interface TableNodeData {
  id: string
  kind: 'source_table' | 'derived_table'
  name: string
  schema?: TableSchema
  cacheInfo?: CacheInfo
  ui: NodeUI
  selected: boolean
  profile?: ProfileResult
  profileLoading?: boolean
  patches?: {
    cellPatches?: Record<string, Record<string, CellValue>>
    deletedRows?: Set<string>
  }
  viewFilters?: ViewFilterConfig
  onToggleExpanded?: (nodeId: string) => void
  onCycleViewMode?: (nodeId: string) => void
  onSetViewMode?: (nodeId: string, mode: NodeViewMode) => void
}

// ============================================================================
// iOS-Inspired Table Card Design System
// ============================================================================

function formatStat(value: number | undefined): string {
  if (value === undefined || value === null) return '—'
  if (Number.isNaN(value)) return '—'
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toFixed(2)
}

function formatDateSpan(minDate: number, maxDate: number): string {
  const diffMs = maxDate - minDate
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 1) return '< 1 day'
  if (diffDays < 30) return `${diffDays}d`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
  const years = Math.floor(diffDays / 365)
  const months = Math.floor((diffDays % 365) / 30)
  return months > 0 ? `${years}y ${months}mo` : `${years}y`
}

// Type badge colors - refined, muted tones (no green)
function getTypeBadgeStyle(type: string): { bg: string; text: string } {
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

// Stat row - refined spacing and typography
function StatRow({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
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

// Numeric stats
function NumericStats({ profile }: { profile: ColumnProfile }) {
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

// String stats - handles unique vs categorical differently
function StringStats({ profile, rowCount }: { profile: ColumnProfile; rowCount: number }) {
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

// Boolean stats - visual bar representation
function BooleanStats({ profile }: { profile: ColumnProfile }) {
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

// Date stats
function DateStats({ profile }: { profile: ColumnProfile }) {
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

// Column profile card - iOS grouped list style
function ColumnProfileCard({ 
  column, columnProfile, columnType, rowCount
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

// Helper to get current view mode from UI state
function getViewMode(ui: NodeUI | undefined): NodeViewMode {
  // If viewMode is explicitly set, use it
  if (ui?.viewMode) return ui.viewMode
  // Legacy support: convert expanded boolean to view mode
  if (ui?.expanded) return 'stats'
  return 'collapsed'
}

// View mode labels and icons
const VIEW_MODE_CONFIG: Record<NodeViewMode, { label: string; icon: JSX.Element }> = {
  collapsed: {
    label: 'Schema',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  stats: {
    label: 'Stats',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  data: {
    label: 'Data',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
}

// View mode dropdown component
function ViewModeDropdown({ 
  currentMode, 
  onSelect,
  isSource 
}: { 
  currentMode: NodeViewMode
  onSelect: (mode: NodeViewMode) => void
  isSource: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelect = (mode: NodeViewMode) => {
    onSelect(mode)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium
          ${isSource ? 'text-[#217346]' : 'text-violet-600 dark:text-violet-400'}
          hover:bg-black/5 dark:hover:bg-white/10
          active:bg-black/10 dark:active:bg-white/15
          transition-colors
        `}
      >
        {VIEW_MODE_CONFIG[currentMode].icon}
        <span>{VIEW_MODE_CONFIG[currentMode].label}</span>
        <svg 
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[100px]"
          onClick={(e) => e.stopPropagation()}
        >
          {(Object.keys(VIEW_MODE_CONFIG) as NodeViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className={`
                w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left
                ${mode === currentMode 
                  ? isSource 
                    ? 'bg-green-50 dark:bg-green-900/30 text-[#217346] dark:text-green-400' 
                    : 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                  : 'text-text-primary hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }
              `}
            >
              {VIEW_MODE_CONFIG[mode].icon}
              <span>{VIEW_MODE_CONFIG[mode].label}</span>
              {mode === currentMode && (
                <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const TableNodeComponent = memo(({ data, selected }: NodeProps<TableNodeData>) => {
  const isSource = data.kind === 'source_table'
  const schema = data.schema
  const rowCount = schema?.rowCount ?? 0
  const colCount = schema?.columns.length ?? 0
  const viewMode = getViewMode(data.ui)
  const profile = data.profile
  const profileLoading = data.profileLoading
  const hasFilters = data.viewFilters && data.viewFilters.conditions.length > 0

  const handleSetViewMode = useCallback((mode: NodeViewMode) => {
    // Use new callback if available, fallback to legacy toggle
    if (data.onSetViewMode) {
      data.onSetViewMode(data.id, mode)
    } else if (data.onCycleViewMode) {
      data.onCycleViewMode(data.id)
    } else if (data.onToggleExpanded) {
      data.onToggleExpanded(data.id)
    }
  }, [data])

  // Fixed width for consistent edge connections
  const NODE_WIDTH = 340

  return (
    <div
      className="rounded-2xl bg-white dark:bg-gray-900 transition-all duration-200 ease-out"
      style={{
        width: NODE_WIDTH,
        // Strong shadow for depth - cards float above canvas
        boxShadow: selected
          ? `0 0 0 2px ${isSource ? '#217346' : 'rgb(139 92 246)'}, 0 12px 40px -8px rgba(0,0,0,0.25), 0 4px 16px -4px rgba(0,0,0,0.15)`
          : '0 4px 16px -4px rgba(0,0,0,0.15), 0 12px 32px -8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header - clean, minimal */}
      <div className="px-4 py-3.5 bg-gray-50/80 dark:bg-gray-800/50 rounded-t-2xl">
        <div className="flex items-center gap-3">
          {/* Icon - muted green for source (app theme), violet for derived */}
          <div className={`
            w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
            ${isSource 
              ? 'bg-[#217346] shadow-md shadow-[#217346]/30' 
              : 'bg-violet-500 shadow-md shadow-violet-500/30'
            }
          `}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-text-primary truncate tracking-tight">
              {data.name}
            </h3>
            <p className="text-[12px] text-text-secondary mt-0.5 flex items-center gap-1.5">
              {formatNumber(rowCount)} rows · {colCount} cols
              {hasFilters && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filtered
                </span>
              )}
              {profileLoading && (
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${isSource ? 'bg-[#217346]' : 'bg-violet-500'} animate-pulse`} />
              )}
            </p>
          </div>
          
          {/* View mode dropdown */}
          <ViewModeDropdown 
            currentMode={viewMode} 
            onSelect={handleSetViewMode}
            isSource={isSource}
          />
        </div>
      </div>

      {/* Body - iOS list style */}
      <div>
        {/* Collapsed: Column list */}
        {viewMode === 'collapsed' && schema && schema.columns.length > 0 && (
          <div className="px-4 py-3">
            <div className="space-y-2">
              {schema.columns.slice(0, 4).map((col) => {
                const typeStyle = getTypeBadgeStyle(col.type)
                return (
                  <div key={col.id} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-text-primary truncate">{col.name}</span>
                    <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
                      {col.type}
                    </span>
                  </div>
                )
              })}
            </div>
            {schema.columns.length > 4 && (
              <div className="text-[11px] text-text-tertiary mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                +{schema.columns.length - 4} more
              </div>
            )}
          </div>
        )}

        {/* Stats: Column profiles */}
        {viewMode === 'stats' && schema && schema.columns.length > 0 && (
          <div 
            className="max-h-[400px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/50 nowheel scrollbar-hide"
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {!profile && !profileLoading && (
              <div className="px-4 py-6 text-[12px] text-text-tertiary text-center">
                No profile data available
              </div>
            )}
            {schema.columns.map((col) => {
              const columnProfile = profile?.columns.find(p => p.columnId === col.id)
              return (
                <ColumnProfileCard
                  key={col.id}
                  column={col}
                  columnProfile={columnProfile}
                  columnType={col.type}
                  rowCount={rowCount}
                />
              )
            })}
          </div>
        )}

        {/* Data: Mini table view with actual data */}
        {viewMode === 'data' && schema && schema.columns.length > 0 && (
          <MiniTableView
            tableId={data.id}
            columns={schema.columns}
            maxHeight={240}
            patches={data.patches}
            viewFilters={data.viewFilters}
          />
        )}

        {/* Status indicators - iOS alert style */}
        
        {/* Error indicator */}
        {data.cacheInfo?.error && (
          <div className="px-4 py-2.5 text-[12px] font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="truncate" title={data.cacheInfo.error}>
              Error: {data.cacheInfo.error}
            </span>
          </div>
        )}
        
        {/* Computing indicator */}
        {data.cacheInfo?.isComputing && !data.cacheInfo?.error && (
          <div className="px-4 py-2.5 text-[12px] font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Computing...
          </div>
        )}
        
        {/* Dirty indicator */}
        {data.cacheInfo?.isDirty && !data.cacheInfo?.error && !data.cacheInfo?.isComputing && (
          <div className="px-4 py-2.5 text-[12px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Needs refresh
          </div>
        )}
      </div>

      {/* Connection handles - larger hit areas for easier connections */}
      
      {/* LEFT handle - visible dot with extended hit area */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="table-handle table-handle-left"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="table-handle table-handle-left !opacity-0"
      />
      
      {/* RIGHT handle - visible dot with extended hit area */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="table-handle table-handle-right"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className="table-handle table-handle-right !opacity-0"
      />
      
      {/* TOP handle - visible dot with extended hit area */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="table-handle table-handle-top"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className="table-handle table-handle-top !opacity-0"
      />
      
      {/* BOTTOM handle - visible dot with extended hit area */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="table-handle table-handle-bottom"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className="table-handle table-handle-bottom !opacity-0"
      />
    </div>
  )
})

TableNodeComponent.displayName = 'TableNodeComponent'
