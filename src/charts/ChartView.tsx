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
  const { data: chartData, loading, error, refetch } = useChartData(sourceTableId, config, sourceVersionHash, columns)
  
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
              <div className="w-10 h-10 bg-accent-green rounded-lg flex items-center justify-center">
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
                    className="text-lg font-semibold bg-transparent border-b-2 border-accent-green outline-none text-gray-900 dark:text-white"
                    autoFocus
                  />
                ) : (
                  <h1 
                    className="text-lg font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-accent-green transition-colors"
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
                className="px-3 py-1.5 text-sm font-medium text-accent-green bg-accent-green/10 hover:bg-accent-green/20 rounded-md transition-colors"
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
                <div className="w-8 h-8 border-2 border-gray-200 border-t-accent-green rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="h-[420px] flex flex-col items-center justify-center text-center px-8">
                <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                  Configuration Error
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md">
                  {error.includes('Column reference') 
                    ? 'The chart references columns that no longer exist in the source table.'
                    : error
                  }
                </p>
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={refetch}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry
                  </button>
                </div>
                <p className="text-xs text-accent-green font-medium">
                  Select new columns below to fix this chart
                </p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-[420px] flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">No Data to Display</p>
                <p className="text-xs text-gray-400">Configure data fields below</p>
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
                      ? 'bg-accent-green text-white'
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
                <span className="px-2.5 py-1 text-xs font-medium text-accent-green bg-accent-green/10 rounded-md">
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
                          ? 'bg-accent-green text-white'
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
                <span className="px-2.5 py-1 text-xs font-medium text-accent-green bg-accent-green/10 rounded-md">
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
                        ? 'bg-accent-green text-white'
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
                  <span className="px-2.5 py-1 text-xs font-medium text-accent-green bg-accent-green/10 rounded-md">
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
                          ? 'bg-accent-green text-white'
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
