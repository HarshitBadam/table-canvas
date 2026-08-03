import { memo, useMemo } from 'react'
import { LoadingSpinner } from '@/layout/LoadingSpinner'
import { Handle, Position, NodeProps } from 'reactflow'
import { ChartNode as ChartNodeType, TableNode } from '@/types'
import { MiniChart } from '@/charts/renderers/ChartRenderer'
import { useChartData } from '@/charts/useChartData'
import { useProjectStore } from '@/state/projectStore'
import { useNodeCacheInfo } from '@/state/tableRuntimeStore'
import { ChartTypeIcon } from '@/charts/ChartTypeIcon'

export type ChartNodeData = ChartNodeType

export const ChartNodeComponent = memo(({ data }: NodeProps<ChartNodeData>) => {
  const chartType = data.plan.chartType
  const sourceTableId = data.plan.sourceTableId
  const config = data.plan.config

  const sourceTable = useProjectStore((state) => 
    state.nodes[sourceTableId] as TableNode | undefined
  )
  const sourceCacheInfo = useNodeCacheInfo(sourceTableId)
  const sourceVersionHash = `${sourceCacheInfo?.currentVersionHash ?? ''}:${
    sourceCacheInfo?.dataRevision ?? 0
  }`

  const columnNames = useMemo(() => {
    const names: Record<string, string> = {}
    sourceTable?.schema?.columns?.forEach(col => {
      names[col.id] = col.name
    })
    return names
  }, [sourceTable?.schema?.columns])

  const xAxisName = config.xAxis ? (columnNames[config.xAxis] || config.xAxis) : ''
  const yAxisName = config.yAxis ? (columnNames[config.yAxis] || config.yAxis) : ''

  const columns = sourceTable?.schema?.columns
  const { data: chartData, loading, error } = useChartData(sourceTableId, config, sourceVersionHash, columns)
  const chartError = sourceTable ? error : 'Source table unavailable'

  const typeColors: Record<string, string> = {
    bar: '#217346',
    line: '#2563eb',
    pie: '#7c3aed',
    scatter: '#0891b2',
  }

  const accentColor = typeColors[chartType] || '#217346'

  return (
    <div
      className={`
        w-[220px] rounded-lg transition-all duration-200 ease-out overflow-hidden
        bg-surface
        ring-1 ring-border shadow-md hover:shadow-lg
      `}
    >
      <div className="px-3 py-2 border-b border-border-subtle bg-surface-secondary/50">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-accent-green/10">
            <ChartTypeIcon
              type={chartType}
              className="h-3 w-3 text-accent-green"
            />
          </div>
          <span className="text-xs font-medium text-text-primary truncate flex-1">
            {data.name}
          </span>
        </div>
      </div>

      <div className="relative px-2 py-2 bg-surface">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(var(--color-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            opacity: 0.4,
          }}
        />

        {sourceTable && loading ? (
          <div className="relative flex h-[110px] items-center justify-center gap-2 text-xs" style={{ color: accentColor }} role="status">
            <LoadingSpinner size="sm" />
            Loading chart…
          </div>
        ) : chartError ? (
          <div className="relative h-[110px] flex flex-col items-center justify-center px-3 text-center">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-error/10">
              <svg className="h-4 w-4 text-error-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-xs font-medium leading-tight text-error-text">
              {chartError.includes('column') ? 'A chart column is missing' : 'Could not load chart'}
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {sourceTable
                ? 'Choose available columns for the chart axes.'
                : 'Choose an available source table in the chart settings.'}
            </p>
          </div>
        ) : !chartData || chartData.length === 0 ? (
          <div className="relative flex h-[110px] items-center justify-center text-xs text-text-tertiary">
            No rows to chart
          </div>
        ) : (
          <div className="relative h-[110px]">
            <MiniChart
              type={chartType}
              config={config}
              data={chartData}
              height={110}
              compact={true}
              columnNames={columnNames}
            />
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle bg-surface-secondary/80 px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
          {chartType === 'pie' ? (
            <>
              <span className="truncate max-w-[120px]">{xAxisName} → {yAxisName}</span>
              <span className="font-medium" style={{ color: accentColor }}>{chartData?.length || 0}</span>
            </>
          ) : (
            <>
              <span className="min-w-0 truncate" title={`X: ${xAxisName}`}>X: <span className="text-text-primary">{xAxisName}</span></span>
              <span className="min-w-0 truncate" title={`Y: ${yAxisName}`}>Y: <span className="text-text-primary">{yAxisName}</span></span>
              <span className="font-medium" style={{ color: accentColor }}>{chartData?.length || 0}</span>
            </>
          )}
        </div>
      </div>

      {/*
        computeSmartEdges (edgeRouter.ts) assigns each edge a targetHandle id of
        'left' | 'right' | 'top' | 'bottom' based on where its source table sits
        relative to this node. A single unnamed handle only ever matches an edge
        that happens to get no id, so charts positioned to the side or below
        their source table would silently lose their connecting line. Charts are
        never a connection source, so every side just needs a target handle.
      */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !border-2 !border-surface !rounded-full !bg-accent-green"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !border-2 !border-surface !rounded-full !bg-accent-green"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2 !h-2 !border-2 !border-surface !rounded-full !bg-accent-green"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className="!w-2 !h-2 !border-2 !border-surface !rounded-full !bg-accent-green"
      />
    </div>
  )
})

ChartNodeComponent.displayName = 'ChartNodeComponent'
