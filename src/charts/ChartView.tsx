import { useMemo, useCallback, useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useProjectStore } from '@/state/projectStore'
import { ChartRenderer } from './ChartRenderer'
import { ChartTypeIcon } from './ChartTypeIcon'
import { useChartData } from './useChartData'
import { useNavigation } from '@/layout/NavigationContext'
import type { ChartNode, ChartConfig, ChartType, AggregationType, TableNode } from '@/types'

interface ChartViewProps {
  chartId: string
}

export function ChartView({ chartId }: ChartViewProps) {
  const { openTable } = useNavigation()
  const nodes = useProjectStore((state) => state.nodes)
  const chartNode = useProjectStore((state) => state.nodes[chartId]) as ChartNode | undefined
  const updateNode = useProjectStore((state) => state.updateNode)
  const updateChartConfig = useProjectStore((state) => state.updateChartConfig)
  const updateChartName = useProjectStore((state) => state.updateChartName)
  const tables = useMemo(
    () => Object.values(nodes).filter(
      (node): node is TableNode => node.kind === 'source_table' || node.kind === 'derived_table',
    ),
    [nodes],
  )
  
  const sourceTableId = chartNode?.plan.sourceTableId || ''
  const sourceTable = useProjectStore((state) => 
    sourceTableId ? state.nodes[sourceTableId] as TableNode | undefined : undefined
  )
  const sourceVersionHash = `${sourceTable?.cacheInfo?.currentVersionHash ?? ''}:${
    sourceTable?.cacheInfo?.dataRevision ?? 0
  }`
  
  const columns = useMemo(() => sourceTable?.schema?.columns ?? [], [sourceTable?.schema?.columns])
  const numericColumns = useMemo(() => columns.filter(c => c.type === 'number'), [columns])
  const categoricalColumns = useMemo(
    () => columns.filter(c => c.type === 'string' || c.type === 'date'),
    [columns],
  )
  
  const columnNames = useMemo(() => {
    const names: Record<string, string> = {}
    columns.forEach(col => { names[col.id] = col.name })
    return names
  }, [columns])
  
  const config = useMemo(() => chartNode?.plan.config ?? {}, [chartNode?.plan.config])
  const { data: chartData, loading, error, refetch } = useChartData(sourceTableId, config, sourceVersionHash, columns)
  
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const skipNameBlurRef = useRef(false)
  
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

  const handleSourceChange = useCallback((newSourceTableId: string) => {
    if (!chartNode || newSourceTableId === chartNode.plan.sourceTableId) return
    const nextTable = nodes[newSourceTableId] as TableNode | undefined
    if (!nextTable) return
    const nextColumns = nextTable.schema?.columns ?? []
    const available = new Set(nextColumns.map((column) => column.id))
    const firstNumeric = nextColumns.find((column) => column.type === 'number')?.id
    const firstCategory = nextColumns.find(
      (column) => column.type === 'string' || column.type === 'date',
    )?.id ?? nextColumns[0]?.id
    const nextConfig: ChartConfig = {
      ...chartNode.plan.config,
      xAxis: chartNode.plan.config.xAxis && available.has(chartNode.plan.config.xAxis)
        ? chartNode.plan.config.xAxis
        : firstCategory,
      yAxis: chartNode.plan.config.yAxis && available.has(chartNode.plan.config.yAxis)
        ? chartNode.plan.config.yAxis
        : firstNumeric,
    }

    const store = useProjectStore.getState()
    store.saveSnapshot('Change chart source')
    for (const edge of Object.values(store.edges)) {
      if (edge.toNodeId === chartId) store.deleteEdge(edge.id)
    }
    store.addEdge({
      fromNodeId: newSourceTableId,
      toNodeId: chartId,
      transformType: 'reference',
    })
    updateNode(chartId, {
      plan: {
        ...chartNode.plan,
        sourceTableId: newSourceTableId,
        config: nextConfig,
      },
    } as Partial<ChartNode>)
  }, [chartId, chartNode, nodes, updateNode])
  
  const handleNameSave = useCallback(() => {
    if (skipNameBlurRef.current) {
      skipNameBlurRef.current = false
      return
    }
    if (editName.trim()) updateChartName(chartId, editName.trim())
    skipNameBlurRef.current = true
    setIsEditingName(false)
  }, [chartId, editName, updateChartName])

  const handleNameCancel = useCallback(() => {
    skipNameBlurRef.current = true
    setIsEditingName(false)
  }, [])
  
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
      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-6">
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-3 py-4 dark:border-gray-700 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 bg-accent-green rounded-lg flex items-center justify-center">
                <ChartTypeIcon type={chartType} className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                {isEditingName ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleNameSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleNameSave()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        handleNameCancel()
                      }
                    }}
                    aria-label="Chart name"
                    className="text-lg font-semibold bg-transparent border-b-2 border-accent-green outline-none text-gray-900 dark:text-white"
                    autoFocus
                  />
                ) : (
                  <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-white">
                    <button
                      type="button"
                      className="block max-w-full truncate bg-transparent p-0 text-left text-lg font-semibold text-gray-900 transition-colors hover:text-accent-green dark:text-white"
                      onClick={() => {
                        skipNameBlurRef.current = false
                        setEditName(chartNode.name)
                        setIsEditingName(true)
                      }}
                      title="Rename chart"
                      aria-label={`Rename chart ${chartNode.name}`}
                    >
                      {chartNode.name}
                    </button>
                  </h1>
                )}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <select
                value={sourceTableId}
                onChange={(event) => handleSourceChange(event.target.value)}
                aria-label="Chart source table"
                className="min-w-0 max-w-40 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 sm:max-w-56"
              >
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>{table.name}</option>
                ))}
              </select>
              <button
                onClick={() => openTable(sourceTableId)}
                className="max-w-40 truncate rounded-md bg-accent-green/10 px-3 py-1.5 text-sm font-medium text-accent-green transition-colors hover:bg-accent-green/20 sm:max-w-56"
              >
                {sourceTable?.name}
              </button>
              <span className="hidden text-sm text-gray-400 sm:inline">{chartData.length} points</span>
            </div>
          </div>
          
          <div className="p-2 sm:p-6">
            {loading ? (
              <div className="h-[420px] flex items-center justify-center">
                <LoadingSpinner size="lg" className="text-accent-green" />
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
        
        <div className="rounded-lg border border-border bg-surface p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-700 sm:flex-row sm:items-center sm:gap-8">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider sm:w-14">Type</span>
            <div className="flex flex-wrap gap-2">
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
          
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
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
            
            <div className="hidden w-px bg-gray-200 dark:bg-gray-700 lg:block" />
            
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
            
            {chartType !== 'scatter' && <div className="hidden w-px bg-gray-200 dark:bg-gray-700 lg:block" />}
            
            {chartType !== 'scatter' && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Aggregation</span>
                  <span className="px-2.5 py-1 text-xs font-medium text-accent-green bg-accent-green/10 rounded-md">
                    {config.aggregation === 'count_distinct'
                      ? 'Distinct'
                      : (config.aggregation || 'sum').charAt(0).toUpperCase()
                        + (config.aggregation || 'sum').slice(1)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['sum', 'avg', 'count', 'count_distinct', 'min', 'max'].map((agg) => (
                    <button
                      key={agg}
                      onClick={() => handleConfigChange({ aggregation: agg as AggregationType })}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                        config.aggregation === agg
                          ? 'bg-accent-green text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {agg === 'count_distinct'
                        ? 'Distinct'
                        : agg.charAt(0).toUpperCase() + agg.slice(1)}
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
