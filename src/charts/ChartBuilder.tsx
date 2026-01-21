/**
 * Chart Builder - Professional chart creation dialog
 */

import { useState, useMemo, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import type { ChartConfig, AggregationType, TableNode } from '@/lib/types'
import { generateId } from '@/lib/utils'

type ChartType = 'bar' | 'line' | 'pie' | 'scatter'

interface ChartBuilderProps {
  isOpen: boolean
  onClose: () => void
  sourceTableId?: string
  preselectedColumn?: string
}

function isLikelyIdColumn(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'id' || lower.endsWith('_id') || lower.endsWith('id') || 
         lower.startsWith('id_') || lower === 'uuid' || lower === 'guid'
}

export function ChartBuilder({ isOpen, onClose, sourceTableId, preselectedColumn }: ChartBuilderProps) {
  const nodes = useProjectStore((state) => state.nodes)
  const addNode = useProjectStore((state) => state.addNode)
  const saveSnapshot = useProjectStore((state) => state.saveSnapshot)

  const tables = useMemo(() => 
    Object.values(nodes).filter((n): n is TableNode => n.kind === 'source_table' || n.kind === 'derived_table'),
    [nodes]
  )

  const [selectedTableId, setSelectedTableId] = useState(sourceTableId || '')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [xAxis, setXAxis] = useState('')
  const [yAxis, setYAxis] = useState('')
  const [aggregation, setAggregation] = useState<AggregationType>('sum')

  const selectedTable = useMemo(() => {
    const tableId = sourceTableId || selectedTableId
    return tables.find(t => t.id === tableId)
  }, [tables, sourceTableId, selectedTableId])

  const columns = selectedTable?.schema?.columns || []
  const numericColumns = useMemo(() => 
    columns.filter(c => c.type === 'number' && !isLikelyIdColumn(c.name)),
    [columns]
  )
  const categoricalColumns = columns.filter(c => c.type === 'string' || c.type === 'date')

  useEffect(() => {
    if (isOpen) {
      setSelectedTableId(sourceTableId || tables[0]?.id || '')
      setChartType('bar')
      setXAxis('')
      setYAxis('')
      setAggregation('sum')
    }
  }, [isOpen, sourceTableId, tables])

  useEffect(() => {
    if (!selectedTable) return
    if (chartType === 'pie' || chartType === 'bar') {
      if (categoricalColumns.length > 0 && !xAxis) setXAxis(preselectedColumn || categoricalColumns[0].id)
      if (numericColumns.length > 0 && !yAxis) setYAxis(numericColumns[0].id)
    } else if (chartType === 'line') {
      if (columns.length > 0 && !xAxis) setXAxis(columns[0].id)
      if (numericColumns.length > 0 && !yAxis) setYAxis(numericColumns[0].id)
    } else if (chartType === 'scatter' && numericColumns.length >= 2) {
      if (!xAxis) setXAxis(numericColumns[0].id)
      if (!yAxis) setYAxis(numericColumns[1]?.id || numericColumns[0].id)
    }
  }, [selectedTable, chartType, columns, categoricalColumns, numericColumns, xAxis, yAxis, preselectedColumn])

  const chartName = useMemo(() => {
    const xCol = columns.find(c => c.id === xAxis)
    const yCol = columns.find(c => c.id === yAxis)
    return yCol && xCol ? `${yCol.name} by ${xCol.name}` : 'New Chart'
  }, [columns, xAxis, yAxis])

  const handleCreate = () => {
    const tableId = sourceTableId || selectedTableId
    if (!tableId || !xAxis) return

    saveSnapshot('Create chart')
    const chartId = generateId()
    const now = new Date().toISOString()
    const sourceNode = nodes[tableId]
    const position = sourceNode 
      ? { x: sourceNode.ui.position.x + 350, y: sourceNode.ui.position.y + 100 }
      : { x: 400, y: 200 }

    addNode({
      id: chartId,
      kind: 'chart',
      name: chartName,
      ui: { position },
      plan: { chartType, sourceTableId: tableId, config: { xAxis, yAxis: yAxis || undefined, aggregation } },
      createdAt: now,
      updatedAt: now,
    })

    useProjectStore.getState().addEdge({ fromNodeId: tableId, toNodeId: chartId, transformType: 'select' })
    onClose()
  }

  const isValid = (sourceTableId || selectedTableId) && xAxis && (chartType === 'scatter' || yAxis)

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#1f1f1f] w-[480px] shadow-2xl overflow-hidden rounded-xl z-50">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-[#217346] to-[#1a5c38] px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
                  </svg>
                </div>
                <div>
                  <Dialog.Title className="text-base font-semibold text-white">
                    Create Chart
                  </Dialog.Title>
                  {selectedTable && (
                    <p className="text-xs text-white/70 mt-0.5">
                      {selectedTable.name} • {selectedTable.schema?.rowCount} rows
                    </p>
                  )}
                </div>
              </div>
              <Dialog.Close className="text-white/60 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Dialog.Close>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* Chart Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Chart Type
              </label>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { type: 'bar' as ChartType, label: 'Bar', icon: <BarIcon /> },
                  { type: 'line' as ChartType, label: 'Line', icon: <LineIcon /> },
                  { type: 'pie' as ChartType, label: 'Pie', icon: <PieIcon /> },
                  { type: 'scatter' as ChartType, label: 'Scatter', icon: <ScatterIcon /> },
                ].map((ct) => (
                  <button
                    key={ct.type}
                    onClick={() => { setChartType(ct.type); setXAxis(''); setYAxis(''); }}
                    className={`
                      flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                      ${chartType === ct.type
                        ? 'border-[#217346] bg-[#217346]/5 dark:bg-[#217346]/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }
                    `}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      chartType === ct.type 
                        ? 'bg-[#217346] text-white' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {ct.icon}
                    </div>
                    <span className={`text-xs font-medium ${
                      chartType === ct.type ? 'text-[#217346]' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {ct.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Data Configuration */}
            {selectedTable && (
              <div className="space-y-4">
                {/* Category / X-Axis */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {chartType === 'pie' ? 'Category (Slices)' : chartType === 'scatter' ? 'X-Axis (Horizontal)' : 'Category (X-Axis)'}
                    </label>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                      {chartType === 'scatter' ? 'Numeric' : 'Text/Date'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(chartType === 'scatter' ? numericColumns : categoricalColumns.length > 0 ? categoricalColumns : columns)
                      .slice(0, 8)
                      .map((col) => (
                        <button
                          key={col.id}
                          onClick={() => setXAxis(col.id)}
                          className={`
                            px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                            ${xAxis === col.id
                              ? 'bg-[#217346] text-white shadow-sm'
                              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-[#217346]/50'
                            }
                          `}
                        >
                          {col.name}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Values / Y-Axis */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {chartType === 'pie' ? 'Value (Size)' : 'Value (Y-Axis)'}
                    </label>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                      Numeric
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {numericColumns.length > 0 ? numericColumns.slice(0, 8).map((col) => (
                      <button
                        key={col.id}
                        onClick={() => setYAxis(col.id)}
                        className={`
                          px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                          ${yAxis === col.id
                            ? 'bg-[#217346] text-white shadow-sm'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-[#217346]/50'
                          }
                        `}
                      >
                        {col.name}
                      </button>
                    )) : (
                      <span className="text-xs text-gray-400 italic">No numeric columns available</span>
                    )}
                  </div>
                </div>

                {/* Aggregation */}
                {chartType !== 'scatter' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Aggregation Method
                    </label>
                    <div className="flex gap-2">
                      {[
                        { value: 'sum', label: 'Sum' },
                        { value: 'avg', label: 'Average' },
                        { value: 'count', label: 'Count' },
                        { value: 'min', label: 'Min' },
                        { value: 'max', label: 'Max' },
                      ].map((agg) => (
                        <button
                          key={agg.value}
                          onClick={() => setAggregation(agg.value as AggregationType)}
                          className={`
                            flex-1 py-2 text-xs font-medium rounded-lg transition-all
                            ${aggregation === agg.value
                              ? 'bg-[#217346] text-white shadow-sm'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }
                          `}
                        >
                          {agg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-gray-50 dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="truncate max-w-[200px]">{chartName}</span>
              </div>
              <div className="flex gap-3">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button 
                  onClick={handleCreate}
                  disabled={!isValid}
                  className="px-5 py-2 text-sm font-medium bg-[#217346] text-white rounded-lg hover:bg-[#1a5c38] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Create Chart
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Icons
function BarIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
    </svg>
  )
}

function LineIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 4 4 6-6" />
    </svg>
  )
}

function PieIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />
    </svg>
  )
}

function ScatterIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="7" cy="14" r="2" />
      <circle cx="11" cy="10" r="2" />
      <circle cx="15" cy="16" r="2" />
      <circle cx="17" cy="8" r="2" />
    </svg>
  )
}
