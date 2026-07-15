import { memo, useCallback } from 'react'
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

const VIEW_MODE_LABELS: Record<NodeViewMode, string> = {
  collapsed: 'Schema',
  data: 'Data',
}

function ViewModeControl({
  currentMode, 
  onSelect,
  isSource 
}: { 
  currentMode: NodeViewMode
  onSelect: (mode: NodeViewMode) => void
  isSource: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Table view"
      className="grid w-32 shrink-0 grid-cols-2 items-center rounded-full bg-black/5 p-0.5 dark:bg-white/10"
      onClick={event => event.stopPropagation()}
    >
      {(Object.keys(VIEW_MODE_LABELS) as NodeViewMode[]).map(mode => (
        <button
          key={mode}
          type="button"
          aria-pressed={currentMode === mode}
          onClick={() => onSelect(mode)}
          className={`rounded-full px-2 py-1 text-xs font-medium outline-none transition-[color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent-green ${
            currentMode === mode
              ? `bg-surface shadow-sm ${isSource ? 'text-accent-text' : 'text-node-derived-text'}`
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          {VIEW_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  )
}

export const TableNodeComponent = memo(({ data, selected }: NodeProps<TableNodeData>) => {
  const isSource = data.kind === 'source_table'
  const schema = data.schema
  const rowCount = data.cacheInfo?.lastRowCount ?? schema?.rowCount ?? 0
  const colCount = schema?.columns.length ?? 0
  const viewMode = getViewMode(data.ui)

  const handleSetViewMode = useCallback((mode: NodeViewMode) => {
    data.onSetViewMode(data.id, mode)
  }, [data])

  return (
    <div
      className="overflow-hidden rounded-2xl bg-surface transition-shadow duration-200 ease-out"
      style={{
        width: NODE_WIDTH,
        boxShadow: selected
          ? '0 14px 40px -10px rgba(0,0,0,0.24), 0 5px 18px -5px rgba(0,0,0,0.16), 0 0 0 1px var(--color-border-elevation)'
          : '0 4px 16px -4px rgba(0,0,0,0.15), 0 12px 32px -8px rgba(0,0,0,0.12), 0 0 0 1px var(--color-border-elevation)',
      }}
    >
      <div className="bg-surface-secondary px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className={`
            w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
            ${isSource 
              ? 'bg-accent-green shadow-md shadow-accent-green/30' 
              : 'bg-accent-purple shadow-md shadow-accent-purple/30'
            }
          `}>
            {isSource ? (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3zM4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
          </div>
          
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold tracking-tight text-text-primary">
              {data.name}
            </h3>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-text-secondary">
              <span>{formatNumber(colCount)} columns</span>
              <span>{formatNumber(rowCount)} rows</span>
            </div>
          </div>
          
          <ViewModeControl 
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
                    <span className="text-xs text-text-primary truncate">{col.name}</span>
                    <ColumnTypeBadge type={col.type} />
                  </div>
                )
              })}
            </div>
            {schema.columns.length > 4 && (
              <div className="mt-3 text-xs text-text-tertiary">
                +{schema.columns.length - 4} more columns
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
          <div className="px-4 py-2.5 text-xs font-medium text-error-text bg-error/10 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="truncate" title={data.cacheInfo.error}>
              Could not update table: {data.cacheInfo.error}
            </span>
          </div>
        )}
        
        {data.cacheInfo?.isComputing && !data.cacheInfo?.error && (
          <div className="px-4 py-2.5 text-xs font-medium text-text-secondary bg-surface-secondary flex items-center gap-2">
            <LoadingSpinner size="sm" />
            Updating table…
          </div>
        )}
        
        {data.cacheInfo?.isDirty && !data.cacheInfo?.error && !data.cacheInfo?.isComputing && (
          <div className="px-4 py-2.5 text-xs font-medium text-warning-text bg-warning/10 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Update pending
          </div>
        )}

      </div>

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
