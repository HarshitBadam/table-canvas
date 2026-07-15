import { useState, useMemo, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import type { AggregationType, ChartType, TableNode, ProjectNode } from '@/types'
import { isLikelyIdColumn, computeChartPosition, buildChartNodeSpec } from './chartBuilderUtils'
import { ChartTypeIcon } from './ChartTypeIcon'

interface ChartBuilderProps {
  isOpen: boolean
  onClose: () => void
  sourceTableId?: string
  preselectedColumn?: string
}

export function ChartBuilder({ isOpen, onClose, sourceTableId, preselectedColumn }: ChartBuilderProps) {
  const nodes = useProjectStore((state) => state.nodes)
  const addNode = useProjectStore((state) => state.addNode)
  const saveSnapshot = useProjectStore((state) => state.saveSnapshot)

  const tables = useMemo(() => 
    (Object.values(nodes) as ProjectNode[]).filter((n): n is TableNode => n.kind === 'source_table' || n.kind === 'derived_table'),
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

  const columns = useMemo(() => selectedTable?.schema?.columns ?? [], [selectedTable?.schema?.columns])
  const numericColumns = useMemo(() => 
    columns.filter(c => c.type === 'number' && !isLikelyIdColumn(c.name)),
    [columns]
  )
  const categoricalColumns = useMemo(
    () => columns.filter(c => c.type === 'string' || c.type === 'date'),
    [columns],
  )

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
    const position = computeChartPosition(nodes[tableId])
    const node = buildChartNodeSpec({ chartName, chartType, tableId, position, xAxis, yAxis, aggregation })

    addNode(node)
    useProjectStore.getState().addEdge({
      fromNodeId: tableId,
      toNodeId: node.id,
      transformType: 'reference',
    })
    onClose()
  }

  const isValid = (sourceTableId || selectedTableId) && xAxis && (chartType === 'scatter' || yAxis)

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content 
          aria-describedby="create-chart-description"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[520px] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border-elevation bg-surface shadow-lg"
        >
          <div className="border-b border-border-subtle px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-secondary text-text-secondary">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold text-text-primary">
                    Create Chart
                  </Dialog.Title>
                  <p id="create-chart-description" className="mt-0.5 truncate text-xs text-text-secondary">
                    {selectedTable ? (
                      <>
                        {selectedTable.name} - {(selectedTable.cacheInfo?.lastRowCount
                        ?? selectedTable.schema?.rowCount
                        ?? 0).toLocaleString()} rows
                      </>
                    ) : 'Choose a source and map its fields'}
                  </p>
                </div>
              </div>
              <Dialog.Close 
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary sm:min-h-0 sm:min-w-0 sm:p-1.5"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Dialog.Close>
            </div>
          </div>
          
          <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-5 overflow-y-auto p-4 sm:p-5">
            <fieldset>
              <legend className="mb-2 block text-xs font-semibold text-text-primary">
                Chart type
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { type: 'bar' as ChartType, label: 'Bar' },
                  { type: 'line' as ChartType, label: 'Line' },
                  { type: 'pie' as ChartType, label: 'Pie' },
                  { type: 'scatter' as ChartType, label: 'Scatter' },
                ].map((ct) => (
                  <button
                    type="button"
                    key={ct.type}
                    onClick={() => { setChartType(ct.type); setXAxis(''); setYAxis(''); }}
                    aria-pressed={chartType === ct.type}
                    className={`
                      flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors
                      ${chartType === ct.type
                        ? 'border-accent-green bg-accent-green/5 dark:bg-accent-green/10'
                        : 'border-border bg-surface hover:border-text-tertiary hover:bg-surface-secondary'
                      }
                    `}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      chartType === ct.type 
                        ? 'bg-accent-green text-white'
                        : 'bg-surface-secondary text-text-tertiary'
                    }`}>
                      <ChartTypeIcon type={ct.type} className="w-4 h-4" />
                    </div>
                    <span className={`text-sm font-medium ${
                      chartType === ct.type ? 'text-accent-text' : 'text-text-secondary'
                    }`}>
                      {ct.label}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            {selectedTable && (
              <div className="space-y-4">
                <fieldset className="divide-y divide-border-subtle rounded-lg border border-border">
                  <legend className="sr-only">Chart fields</legend>
                  <div className="p-3">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold text-text-primary">
                        {chartType === 'pie' ? 'Category' : chartType === 'scatter' ? 'X axis' : 'Category'}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {chartType === 'scatter' ? 'Numeric' : 'Text or date'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                    {(chartType === 'scatter' ? numericColumns : categoricalColumns.length > 0 ? categoricalColumns : columns)
                      .slice(0, 8)
                      .map((col) => (
                        <button
                          type="button"
                          key={col.id}
                          onClick={() => setXAxis(col.id)}
                          aria-pressed={xAxis === col.id}
                          className={`
                            rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors
                            ${xAxis === col.id
                              ? 'border-accent-green bg-accent-green text-white'
                              : 'border-border bg-surface text-text-secondary hover:border-text-tertiary hover:bg-surface-secondary'
                            }
                          `}
                        >
                          {col.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold text-text-primary">
                        {chartType === 'pie' ? 'Value' : 'Y axis'}
                      </span>
                      <span className="text-xs text-text-tertiary">
                      Numeric
                    </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                    {numericColumns.length > 0 ? numericColumns.slice(0, 8).map((col) => (
                      <button
                        type="button"
                        key={col.id}
                        onClick={() => setYAxis(col.id)}
                        aria-pressed={yAxis === col.id}
                        className={`
                          rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors
                          ${yAxis === col.id
                            ? 'border-accent-green bg-accent-green text-white'
                            : 'border-border bg-surface text-text-secondary hover:border-text-tertiary hover:bg-surface-secondary'
                          }
                        `}
                      >
                        {col.name}
                      </button>
                    )) : (
                      <span className="text-xs text-text-tertiary">No numeric columns available</span>
                    )}
                    </div>
                  </div>
                </fieldset>

                {chartType !== 'scatter' && (
                  <fieldset>
                    <legend className="mb-2 block text-xs font-semibold text-text-primary">
                      Aggregation
                    </legend>
                    <div className="flex flex-wrap gap-1.5 rounded-lg bg-surface-secondary p-1">
                      {[
                        { value: 'sum', label: 'Sum' },
                        { value: 'avg', label: 'Average' },
                        { value: 'count', label: 'Count' },
                        { value: 'count_distinct', label: 'Distinct' },
                        { value: 'min', label: 'Min' },
                        { value: 'max', label: 'Max' },
                      ].map((agg) => (
                        <button
                          type="button"
                          key={agg.value}
                          onClick={() => setAggregation(agg.value as AggregationType)}
                          aria-pressed={aggregation === agg.value}
                          className={`
                            min-w-16 flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors
                            ${aggregation === agg.value
                              ? 'border-accent-green bg-surface text-accent-text shadow-sm'
                              : 'border-transparent text-text-secondary hover:bg-surface-tertiary'
                            }
                          `}
                        >
                          {agg.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            )}
          </div>

          <div 
            className="shrink-0 border-t border-border-subtle bg-surface px-4 py-3 sm:px-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="hidden min-w-0 sm:block">
                <p className="text-xs text-text-tertiary">Chart name</p>
                <p className="max-w-[230px] truncate text-xs font-medium text-text-primary">{chartName}</p>
              </div>
              <div className="ml-auto flex gap-2">
                <Dialog.Close asChild>
                  <button className="btn btn-ghost">
                    Cancel
                  </button>
                </Dialog.Close>
                <button 
                  onClick={handleCreate}
                  disabled={!isValid}
                  className="btn btn-primary px-5"
                >
                  Create Chart
                </button>
              </div>
            </div>
          </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
