import { memo, useMemo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { ChartNode as ChartNodeType, TableNode } from '@/lib/types'
import { MiniChart } from '@/charts/ChartRenderer'
import { useChartData } from '@/charts/useChartData'
import { useProjectStore } from '@/state/projectStore'

interface ChartNodeData extends ChartNodeType {
  selected: boolean
}

export const ChartNodeComponent = memo(({ data, selected }: NodeProps<ChartNodeData>) => {
  const chartType = data.plan.chartType
  const sourceTableId = data.plan.sourceTableId
  const config = data.plan.config

  const sourceTable = useProjectStore((state) => 
    state.nodes[sourceTableId] as TableNode | undefined
  )
  const sourceVersionHash = sourceTable?.cacheInfo?.currentVersionHash
  
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

  // Chart type colors for subtle accents
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
        bg-white dark:bg-gray-900
        ${selected 
          ? 'ring-2 ring-accent-green shadow-xl scale-[1.02]' 
          : 'ring-1 ring-gray-200 dark:ring-gray-700 shadow-md hover:shadow-lg'
        }
      `}
    >
      {/* Header - Clean, no top stripe */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
        <div className="flex items-center gap-2">
          <div 
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <svg 
              className="w-3 h-3" 
              style={{ color: accentColor }}
              viewBox="0 0 24 24"
              fill={chartType === 'line' ? 'none' : 'currentColor'}
              stroke={chartType === 'line' ? 'currentColor' : 'none'}
              strokeWidth={chartType === 'line' ? 2 : 0}
            >
              {chartType === 'bar' && <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />}
              {chartType === 'line' && <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 4 4 6-6" />}
              {chartType === 'pie' && <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />}
              {chartType === 'scatter' && <><circle cx="7" cy="14" r="2" /><circle cx="11" cy="10" r="2" /><circle cx="15" cy="16" r="2" /><circle cx="17" cy="8" r="2" /></>}
            </svg>
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate flex-1">
            {data.name}
          </span>
        </div>
      </div>

      {/* Chart Area with grid background */}
      <div className="relative px-2 py-2 bg-white dark:bg-gray-900">
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(#e5e5ea 1px, transparent 1px), linear-gradient(90deg, #e5e5ea 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            opacity: 0.4,
          }}
        />
        
        {loading ? (
          <div className="relative h-[110px] flex items-center justify-center">
            <div 
              className="w-4 h-4 border-2 border-gray-200 rounded-full animate-spin"
              style={{ borderTopColor: accentColor }}
            />
          </div>
        ) : error ? (
          <div className="relative h-[110px] flex items-center justify-center text-[10px] text-red-500 px-2 text-center">
            {error}
          </div>
        ) : !chartData || chartData.length === 0 ? (
          <div className="relative h-[110px] flex items-center justify-center text-[10px] text-text-tertiary">
            No data
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

      {/* Footer */}
      <div className="px-3 py-1.5 bg-gray-50/80 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between text-[9px] text-gray-500 dark:text-gray-400">
          {chartType === 'pie' ? (
            <>
              <span className="truncate max-w-[120px]">{xAxisName} → {yAxisName}</span>
              <span className="font-medium" style={{ color: accentColor }}>{chartData?.length || 0}</span>
            </>
          ) : (
            <>
              <span>X: <span className="text-gray-700 dark:text-gray-300">{xAxisName}</span></span>
              <span>Y: <span className="text-gray-700 dark:text-gray-300">{yAxisName}</span></span>
              <span className="font-medium" style={{ color: accentColor }}>{chartData?.length || 0}</span>
            </>
          )}
        </div>
      </div>

      {/* Connection Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border-2 !border-white dark:!border-gray-900 !rounded-full !bg-accent-green"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border-2 !border-white dark:!border-gray-900 !rounded-full !bg-accent-green"
      />
    </div>
  )
})

ChartNodeComponent.displayName = 'ChartNodeComponent'
