import { memo, useCallback, useEffect, useState } from 'react'
import { LoadingSpinner } from '@/layout/LoadingSpinner'
import { Handle, Position, NodeProps } from 'reactflow'
import { TableSchema, NodeUI, NodeViewMode, CellValue, ViewFilterConfig } from '@/types'
import { formatNumber } from '@/lib/utils'
import { isTableUpdating, useNodeCacheInfo } from '@/state/tableRuntimeStore'
import { MiniTableView } from './MiniTableView'
import { NODE_WIDTH } from '../canvasConstants'
import { ColumnTypeBadge } from '@/components/ColumnTypeBadge'
import { TableTypeIcon } from '@/components/TableTypeIcon'

/** Fast imports finish before this; skip skeleton/footer so they don't flash. */
const UPDATING_CHROME_DELAY_MS = 180

interface TableNodeData {
  id: string
  kind: 'source_table' | 'derived_table'
  name: string
  schema?: TableSchema
  ui: NodeUI
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
  isSource,
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
              : 'text-text-secondary hover:text-text-primary'
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
  const cacheInfo = useNodeCacheInfo(data.id)
  // Keep known dimensions visible while data materializes so the node matches
  // the sidebar (schema.rowCount / lastRowCount are available before rows load).
  const rowCount = cacheInfo?.lastRowCount ?? schema?.rowCount ?? 0
  const colCount = schema?.columns.length ?? 0
  const viewMode = getViewMode(data.ui)
  const updating = isTableUpdating(cacheInfo) && !cacheInfo?.error
  const [updatingChromeReady, setUpdatingChromeReady] = useState(false)
  const showUpdatingChrome = updating && updatingChromeReady
  const hasColumns = (schema?.columns.length ?? 0) > 0
  const showSchemaBody = (viewMode === 'collapsed' && hasColumns)
    || (showUpdatingChrome && !hasColumns)
  const showDataBody = viewMode === 'data' && hasColumns

  useEffect(() => {
    if (!updating) {
      setUpdatingChromeReady(false)
      return
    }
    const timer = window.setTimeout(() => setUpdatingChromeReady(true), UPDATING_CHROME_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [updating])

  const handleSetViewMode = useCallback((mode: NodeViewMode) => {
    data.onSetViewMode(data.id, mode)
  }, [data])

  return (
    <div
      className="relative"
      style={{
        width: NODE_WIDTH,
      }}
    >
      <div
        className="overflow-hidden rounded-2xl bg-surface transition-shadow duration-200 ease-out"
        style={{
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
              ? 'bg-accent-green shadow-md shadow-accent-green/30 dark:shadow-sm dark:shadow-black/20'
              : 'bg-accent-purple shadow-md shadow-accent-purple/30 dark:shadow-sm dark:shadow-black/20'
            }
          `}>
            <TableTypeIcon className="h-4 w-4 text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold tracking-tight text-text-primary">
              {data.name}
            </h3>
            {hasColumns && (
              <div className={`mt-0.5 text-xs text-text-secondary ${
                rowCount >= 10_000 ? 'flex flex-col leading-snug' : ''
              }`}>
                <span>{formatNumber(colCount)} columns</span>
                <span className={rowCount >= 10_000 ? undefined : 'ml-1'}>
                  {formatNumber(rowCount)} rows
                </span>
              </div>
            )}
          </div>

          <ViewModeControl
            currentMode={viewMode}
            onSelect={handleSetViewMode}
            isSource={isSource}
          />
        </div>
      </div>

      <div>
        {schema && !hasColumns && !updating && !cacheInfo?.error && (
          <div className="flex flex-col items-center justify-center px-6 py-6 text-center">
            <svg
              className="mb-2 h-5 w-5 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
              <path d="M3.5 9.5h17M9 9.5v10" />
            </svg>
            <p className="text-xs font-medium text-text-secondary">No columns to preview</p>
            <p className="mt-1 text-xs text-text-tertiary">Add a column to see table data here.</p>
          </div>
        )}

        {showSchemaBody && schema && (
          <div className="px-4 py-3">
            <div className="space-y-2">
              {hasColumns
                ? schema.columns.slice(0, 4).map((col) => (
                    <div key={col.id} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-text-primary truncate">{col.name}</span>
                      <ColumnTypeBadge type={col.type} />
                    </div>
                  ))
                : [0, 1, 2].map((index) => (
                    <div key={index} className="flex items-center justify-between gap-3" aria-hidden="true">
                      <span className="h-3 w-24 animate-pulse rounded bg-surface-tertiary" />
                      <span className="h-4 w-12 animate-pulse rounded bg-surface-tertiary" />
                    </div>
                  ))}
            </div>
            {schema.columns.length > 4 && (
              <div className="mt-3 text-xs text-text-tertiary">
                +{schema.columns.length - 4} more columns
              </div>
            )}
          </div>
        )}

        {showDataBody && schema && (
          <MiniTableView
            tableId={data.id}
            columns={schema.columns}
            maxHeight={240}
            patches={data.patches}
            viewFilters={data.viewFilters}
            versionHash={cacheInfo?.currentVersionHash}
            dataRevision={cacheInfo?.dataRevision}
            isUpdating={showUpdatingChrome}
            updatingLabel="Loading data…"
          />
        )}

        {cacheInfo?.error && (
          <div className="px-4 py-2.5 text-xs font-medium text-error-text bg-error/10 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="truncate" title={cacheInfo.error}>
              Could not update table: {cacheInfo.error}
            </span>
          </div>
        )}

        {showUpdatingChrome && !showDataBody && (
          <div className="px-4 py-2.5 text-xs font-medium text-text-secondary bg-surface-secondary flex items-center gap-2">
            <LoadingSpinner size="sm" />
            Loading data…
          </div>
        )}

      </div>

      </div>

      {/*
        computeSmartEdges (edgeRouter.ts) picks whichever of left/right/top/bottom
        best matches each node's relative position, independently for the source
        end and the target end of an edge. Upstream and downstream tables can end
        up on any side of each other depending on manual dragging or auto-layout
        direction, so every side needs both a source and a target handle sharing
        that side's id - otherwise a computed handle id can point at a handle of
        the wrong type (or none at all), and React Flow silently drops the edge.
      */}
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
        className="table-handle table-handle-left"
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
        className="table-handle table-handle-right"
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
        className="table-handle table-handle-top"
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
        className="table-handle table-handle-bottom"
      />
    </div>
  )
})

TableNodeComponent.displayName = 'TableNodeComponent'
