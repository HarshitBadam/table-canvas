import { useState, useMemo, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import type { AggregationType, ChartType, TableNode, ProjectNode } from '@/types'
import { SelectField } from '@/components/SelectField'
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

  const isValid = Boolean((sourceTableId || selectedTableId) && xAxis && yAxis)

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content 
          className="fixed left-1/2 top-1/2 z-modal flex max-h-[calc(100dvh-1rem)] w-[600px] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl motion-safe:animate-scale-in"
        >
          <div className="border-b border-border-subtle bg-accent-green/5 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-green text-white">
                  <ChartTypeIcon type={chartType} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold text-text-primary">
                    Create chart
                  </Dialog.Title>
                  <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                    {selectedTable ? (
                      <>
                        <span className="truncate font-medium text-text-primary">{selectedTable.name}</span>
                        <span className="rounded bg-surface px-1.5 py-0.5 text-text-secondary shadow-sm">
                          {(selectedTable.cacheInfo?.lastRowCount
                            ?? selectedTable.schema?.rowCount
                            ?? 0).toLocaleString()} rows
                        </span>
                      </>
                    ) : 'Choose a source and map its fields'}
                  </Dialog.Description>
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
          <div className="overflow-y-auto px-4 sm:px-5">
            <fieldset className="py-5">
              <legend className="mb-3 text-sm font-semibold text-text-primary">Chart type</legend>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { type: 'bar' as ChartType, label: 'Bar' },
                  { type: 'line' as ChartType, label: 'Line' },
                  { type: 'pie' as ChartType, label: 'Pie' },
                  { type: 'scatter' as ChartType, label: 'Scatter' },
                ].map((ct) => (
                  <label
                    key={ct.type}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-accent-green focus-within:ring-offset-2 ${
                      chartType === ct.type
                        ? 'border-accent-green bg-accent-green text-white shadow-sm'
                        : 'border-border bg-surface text-text-secondary hover:border-text-tertiary hover:bg-surface-secondary'
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="chart-type"
                      value={ct.type}
                      checked={chartType === ct.type}
                      onChange={() => { setChartType(ct.type); setXAxis(''); setYAxis(''); }}
                    />
                    <ChartTypeIcon type={ct.type} className="h-3.5 w-3.5" />
                    {ct.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {selectedTable && (
              <>
                <fieldset className="border-t border-border-subtle py-5">
                  <legend className="mb-4 text-sm font-semibold text-text-primary">Field mapping</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-text-primary">
                        {chartType === 'scatter' ? 'X axis column' : 'Category column'}
                      </label>
                      <p className="mb-1.5 mt-0.5 text-xs text-text-tertiary">
                        {chartType === 'scatter' ? 'Numeric values' : 'Text or date values'}
                      </p>
                      <SelectField
                        value={xAxis}
                        onValueChange={setXAxis}
                        ariaLabel={chartType === 'scatter' ? 'X axis column' : 'Category column'}
                        placeholder="Choose a column"
                        options={(chartType === 'scatter' ? numericColumns : categoricalColumns.length > 0 ? categoricalColumns : columns)
                          .map(column => ({ value: column.id, label: column.name }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-primary">
                        {chartType === 'pie' ? 'Value column' : 'Y axis column'}
                      </label>
                      <p className="mb-1.5 mt-0.5 text-xs text-text-tertiary">Numeric values</p>
                      <SelectField
                        value={yAxis}
                        onValueChange={setYAxis}
                        ariaLabel={chartType === 'pie' ? 'Value column' : 'Y axis column'}
                        placeholder="Choose a column"
                        disabled={numericColumns.length === 0}
                        options={numericColumns.map(column => ({ value: column.id, label: column.name }))}
                      />
                    </div>
                  </div>
                  {numericColumns.length === 0 && (
                    <p className="mt-3 text-xs leading-5 text-warning-text" role="status">
                      No numeric columns are available. Convert a column to Number in the table, then return to create this chart.
                    </p>
                  )}
                  {chartType === 'scatter' && numericColumns.length === 1 && (
                    <p className="mt-3 text-xs leading-5 text-warning-text" role="status">
                      Scatter charts need two numeric columns. Add or convert another numeric column to continue.
                    </p>
                  )}
                </fieldset>

                {chartType !== 'scatter' && (
                  <fieldset className="border-t border-border-subtle py-5">
                    <legend className="mb-3 text-sm font-semibold text-text-primary">Summarize values</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { value: 'sum', label: 'Sum' },
                        { value: 'avg', label: 'Average' },
                        { value: 'count', label: 'Count' },
                        { value: 'count_distinct', label: 'Distinct' },
                        { value: 'min', label: 'Min' },
                        { value: 'max', label: 'Max' },
                      ].map((agg) => (
                        <label
                          key={agg.value}
                          className={`min-h-9 cursor-pointer rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-accent-green focus-within:ring-offset-2 ${
                            aggregation === agg.value
                              ? 'border-accent-green bg-accent-green/10 text-accent-text'
                              : 'border-border bg-surface text-text-secondary hover:border-text-tertiary hover:bg-surface-secondary'
                          }`}
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name="aggregation"
                            value={agg.value}
                            checked={aggregation === agg.value}
                            onChange={() => setAggregation(agg.value as AggregationType)}
                          />
                          {agg.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            )}
          </div>

          <div 
            className="shrink-0 border-t border-border-subtle bg-accent-green/5 px-4 py-3 sm:px-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-text-tertiary">Chart name</p>
                <p className="max-w-36 truncate text-xs font-medium text-text-primary sm:max-w-[230px]">{chartName}</p>
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
                  Create chart
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
