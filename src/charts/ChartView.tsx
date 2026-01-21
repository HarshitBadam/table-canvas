/**
 * Chart View - Full chart editing interface
 */

import { useMemo, useCallback, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { ChartRenderer } from './ChartRenderer'
import { useChartData } from './useChartData'
import type { ChartNode, ChartConfig, AggregationType, TableNode } from '@/lib/types'

interface ChartViewProps {
  chartId: string
  onNavigateToTable: (tableId: string) => void
}

type ChartType = 'bar' | 'line' | 'pie' | 'scatter'

export function ChartView({ chartId, onNavigateToTable }: ChartViewProps) {
  const chartNode = useProjectStore((state) => state.nodes[chartId]) as ChartNode | undefined
  const updateNode = useProjectStore((state) => state.updateNode)
  const updateChartConfig = useProjectStore((state) => state.updateChartConfig)
  const updateChartName = useProjectStore((state) => state.updateChartName)
  
  const sourceTableId = chartNode?.plan.sourceTableId || ''
  const sourceTable = useProjectStore((state) => 
    sourceTableId ? state.nodes[sourceTableId] as TableNode | undefined : undefined
  )
  const sourceVersionHash = sourceTable?.cacheInfo?.currentVersionHash
  
  const columns = sourceTable?.schema?.columns || []
  const numericColumns = columns.filter(c => c.type === 'number')
  const categoricalColumns = columns.filter(c => c.type === 'string' || c.type === 'date')
  
  const columnNames = useMemo(() => {
    const names: Record<string, string> = {}
    columns.forEach(col => { names[col.id] = col.name })
    return names
  }, [columns])
  
  const config = chartNode?.plan.config || {}
  const { data: chartData, loading, error } = useChartData(sourceTableId, config, sourceVersionHash)
  
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  
  const handleConfigChange = useCallback((updates: Partial<ChartConfig>) => {
    if (!chartNode) return
    updateChartConfig(chartId, updates)
  }, [chartId, chartNode, updateChartConfig])
  
  const handleChartTypeChange = useCallback((newType: ChartType) => {
    if (!chartNode) return
    updateNode(chartId, {
      plan: { ...chartNode.plan, chartType: newType },
      updatedAt: new Date().toISOString(),
    } as Partial<ChartNode>)
  }, [chartId, chartNode, updateNode])
  
  const handleNameSave = useCallback(() => {
    if (editName.trim()) updateChartName(chartId, editName.trim())
    setIsEditingName(false)
  }, [chartId, editName, updateChartName])
  
  if (!chartNode) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Chart not found</div>
  }
  
  if (!sourceTable && sourceTableId) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Source table not found</div>
  }
  
  const chartType = chartNode.plan.chartType
  const xAxisName = config.xAxis ? (columnNames[config.xAxis] || config.xAxis) : '—'
  const yAxisName = config.yAxis ? (columnNames[config.yAxis] || config.yAxis) : '—'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto w-full space-y-4">
        {/* Chart Card */}
        <div className="bg-white dark:bg-[#252526] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Chart Header */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#217346] rounded-lg flex items-center justify-center">
                <ChartTypeIcon type={chartType} className="w-5 h-5 text-white" />
              </div>
              <div>
                {isEditingName ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleNameSave}
                    onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                    className="text-lg font-semibold bg-transparent border-b-2 border-[#217346] outline-none text-gray-900 dark:text-white"
                    autoFocus
                  />
                ) : (
                  <h1 
                    className="text-lg font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-[#217346] transition-colors"
                    onClick={() => { setEditName(chartNode.name); setIsEditingName(true); }}
                    title="Click to rename"
                  >
                    {chartNode.name}
                  </h1>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onNavigateToTable(sourceTableId)}
                className="px-3 py-1.5 text-sm font-medium text-[#217346] bg-[#217346]/10 hover:bg-[#217346]/20 rounded-md transition-colors"
              >
                {sourceTable?.name}
              </button>
              <span className="text-sm text-gray-400">{chartData.length} points</span>
            </div>
          </div>
          
          {/* Chart Area */}
          <div className="p-6">
            {loading ? (
              <div className="h-[420px] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-[#217346] rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="h-[420px] flex items-center justify-center text-base text-red-500">{error}</div>
            ) : chartData.length === 0 ? (
              <div className="h-[420px] flex items-center justify-center text-base text-gray-400">
                Configure data fields below
              </div>
            ) : (
              <ChartRenderer
                type={chartType}
                config={config}
                data={chartData}
                height={420}
                showLegend={true}
                columnNames={columnNames}
              />
            )}
          </div>
        </div>
        
        {/* Configuration Panel */}
        <div className="bg-white dark:bg-[#252526] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          {/* Chart Type Row */}
          <div className="flex items-center gap-8 pb-4 mb-4 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-14">Type</span>
            <div className="flex gap-2">
              {(['bar', 'line', 'pie', 'scatter'] as ChartType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleChartTypeChange(type)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    chartType === type
                      ? 'bg-[#217346] text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <ChartTypeIcon type={type} className="w-4 h-4" />
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Data Fields Row */}
          <div className="flex gap-8">
            {/* X-Axis */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {chartType === 'pie' ? 'Category' : 'X-Axis'}
                </span>
                <span className="px-2.5 py-1 text-xs font-medium text-[#217346] bg-[#217346]/10 rounded-md">
                  {xAxisName}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(chartType === 'scatter' ? numericColumns : categoricalColumns.length > 0 ? categoricalColumns : columns)
                  .slice(0, 6)
                  .map((col) => (
                    <button
                      key={col.id}
                      onClick={() => handleConfigChange({ xAxis: col.id })}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                        config.xAxis === col.id
                          ? 'bg-[#217346] text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {col.name}
                    </button>
                  ))}
              </div>
            </div>
            
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            
            {/* Y-Axis */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {chartType === 'pie' ? 'Value' : 'Y-Axis'}
                </span>
                <span className="px-2.5 py-1 text-xs font-medium text-[#217346] bg-[#217346]/10 rounded-md">
                  {yAxisName}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {numericColumns.slice(0, 6).map((col) => (
                  <button
                    key={col.id}
                    onClick={() => handleConfigChange({ yAxis: col.id })}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      config.yAxis === col.id
                        ? 'bg-[#217346] text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {col.name}
                  </button>
                ))}
              </div>
            </div>
            
            {chartType !== 'scatter' && <div className="w-px bg-gray-200 dark:bg-gray-700" />}
            
            {/* Aggregation */}
            {chartType !== 'scatter' && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Aggregation</span>
                  <span className="px-2.5 py-1 text-xs font-medium text-[#217346] bg-[#217346]/10 rounded-md">
                    {(config.aggregation || 'sum').charAt(0).toUpperCase() + (config.aggregation || 'sum').slice(1)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['sum', 'avg', 'count', 'min', 'max'].map((agg) => (
                    <button
                      key={agg}
                      onClick={() => handleConfigChange({ aggregation: agg as AggregationType })}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                        config.aggregation === agg
                          ? 'bg-[#217346] text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {agg.charAt(0).toUpperCase() + agg.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChartTypeIcon({ type, className }: { type: ChartType; className?: string }) {
  switch (type) {
    case 'bar':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
        </svg>
      )
    case 'line':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 4 4 6-6" />
        </svg>
      )
    case 'pie':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />
        </svg>
      )
    case 'scatter':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <circle cx="7" cy="14" r="2" />
          <circle cx="11" cy="10" r="2" />
          <circle cx="15" cy="16" r="2" />
          <circle cx="17" cy="8" r="2" />
        </svg>
      )
    default:
      return null
  }
}
