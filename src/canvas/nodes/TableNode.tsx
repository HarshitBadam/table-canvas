import { memo, useCallback, useState, useRef, useEffect } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Handle, Position, NodeProps } from 'reactflow'
import { TableSchema, CacheInfo, NodeUI, NodeViewMode, CellValue, ViewFilterConfig } from '@/types'
import { formatNumber } from '@/lib/utils'
import { MiniTableView } from './MiniTableView'
import { NODE_WIDTH } from '../canvasConstants'
import { ColumnTypeBadge } from '@/components/ColumnTypeBadge'

interface TableNodeData {
  id: string
  kind: 'source_table' | 'derived_table'
  name: string
  schema?: TableSchema
  cacheInfo?: CacheInfo
  ui: NodeUI
  selected: boolean
  patches?: {
    cellPatches?: Record<string, Record<string, CellValue>>
    deletedRows?: Set<string>
  }
  viewFilters?: ViewFilterConfig
  onSetViewMode: (nodeId: string, mode: NodeViewMode) => void
}


function getViewMode(ui: NodeUI | undefined): NodeViewMode {
  return ui?.viewMode ?? 'collapsed'
}

const VIEW_MODE_CONFIG: Record<NodeViewMode, { label: string; icon: JSX.Element }> = {
  collapsed: {
    label: 'Schema',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
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
                    ? 'bg-green-50 dark:bg-[#1a2e22]/50 text-[#217346] dark:text-[#7ab892]' 
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
  const hasFilters = data.viewFilters && data.viewFilters.conditions.length > 0

  const handleSetViewMode = useCallback((mode: NodeViewMode) => {
    data.onSetViewMode(data.id, mode)
  }, [data])

  return (
    <div
      className="rounded-2xl bg-surface transition-all duration-200 ease-out"
      style={{
        width: NODE_WIDTH,
        boxShadow: selected
          ? `0 0 0 2px ${isSource ? '#217346' : 'rgb(139 92 246)'}, 0 12px 40px -8px rgba(0,0,0,0.25), 0 4px 16px -4px rgba(0,0,0,0.15)`
          : '0 4px 16px -4px rgba(0,0,0,0.15), 0 12px 32px -8px rgba(0,0,0,0.12), 0 0 0 1px var(--color-border-elevation)',
      }}
    >
      <div className="px-4 py-3.5 bg-surface-secondary/80 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className={`
            w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
            ${isSource 
              ? 'bg-accent-green shadow-md shadow-accent-green/30' 
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
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-[#1a2e22]/60 text-emerald-600 dark:text-[#7ab892] text-[10px] font-medium">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filtered
                </span>
              )}
            </p>
          </div>
          
          <ViewModeDropdown 
            currentMode={viewMode} 
            onSelect={handleSetViewMode}
            isSource={isSource}
          />
        </div>
      </div>

      <div>
        {viewMode === 'collapsed' && schema && schema.columns.length > 0 && (
          <div className="px-4 py-3">
            <div className="space-y-2">
              {schema.columns.slice(0, 4).map((col) => {
                return (
                  <div key={col.id} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-text-primary truncate">{col.name}</span>
                    <ColumnTypeBadge type={col.type} />
                  </div>
                )
              })}
            </div>
            {schema.columns.length > 4 && (
              <div className="text-[11px] text-text-tertiary mt-3 pt-2 border-t border-border-subtle">
                +{schema.columns.length - 4} more
              </div>
            )}
          </div>
        )}

        {viewMode === 'data' && schema && schema.columns.length > 0 && (
          <MiniTableView
            tableId={data.id}
            columns={schema.columns}
            maxHeight={240}
            patches={data.patches}
            viewFilters={data.viewFilters}
            versionHash={data.cacheInfo?.currentVersionHash}
          />
        )}

        
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
        
        {data.cacheInfo?.isComputing && !data.cacheInfo?.error && (
          <div className="px-4 py-2.5 text-[12px] font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 flex items-center gap-2">
            <LoadingSpinner size="sm" />
            Computing...
          </div>
        )}
        
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
