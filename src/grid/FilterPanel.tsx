import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { getEngine } from '@/engine/EngineAdapter'
import { CellValue, ColumnSchema, FilterCondition, ViewFilterConfig } from '@/types'
import {
  FilterColumnType,
  getOperatorsForType,
  createFilterCondition,
  getUniqueValues,
  countUniqueValues,
  getEffectiveFilterType,
} from './filterUtils'
import {
  FilterCardProps,
  FilterConditionWithId,
  DateFilterCard,
  NumberFilterCard,
  BooleanFilterCard,
  EnumFilterCard,
  StringFilterCard,
} from './FilterCards'

interface FilterPanelProps {
  tableId: string
  isOpen: boolean
  onClose: () => void
  columns: ColumnSchema[]
  filters: ViewFilterConfig
  onFiltersChange: (filters: ViewFilterConfig) => void
  rows: Array<{ __rowId: string; [key: string]: CellValue }>
  getDisplayValue: (rowId: string, colId: string, base: CellValue) => CellValue
  matchingRowCount: number
  totalRowCount: number
  initialColumnId?: string
}

export function FilterPanel({
  tableId,
  isOpen,
  onClose,
  columns,
  filters,
  onFiltersChange,
  rows,
  getDisplayValue,
  matchingRowCount,
  totalRowCount,
  initialColumnId,
}: FilterPanelProps) {
  const [engineUniqueValues, setEngineUniqueValues] = useState<Record<string, CellValue[]>>({})

  useEffect(() => {
    if (!isOpen || columns.length === 0) return
    let cancelled = false
    void Promise.all(columns.map(async column => {
      try {
        const values = await getEngine().getDistinctValues(tableId, column.name, 101)
        return [column.id, values] as const
      } catch {
        return null
      }
    })).then(entries => {
      if (!cancelled) {
        setEngineUniqueValues(Object.fromEntries(entries.filter(entry => entry !== null)))
      }
    })
    return () => {
      cancelled = true
    }
  }, [columns, isOpen, tableId])

  const columnUniqueValueCounts = useMemo(() => {
    if (!isOpen) return {}

    const counts: Record<string, number> = {}
    columns.forEach(col => {
      counts[col.id] = engineUniqueValues[col.id]?.length
        ?? countUniqueValues(rows, col.id, getDisplayValue)
    })
    return counts
  }, [columns, engineUniqueValues, getDisplayValue, isOpen, rows])

  const getColumnFilterType = useCallback((columnId: string): FilterColumnType => {
    const column = columns.find(c => c.id === columnId)
    if (!column) return 'string'
    return getEffectiveFilterType(column.type, columnUniqueValueCounts[columnId] || 0)
  }, [columns, columnUniqueValueCounts])

  const conditionsWithIds: FilterConditionWithId[] = useMemo(() => {
    return filters.conditions.map((cond, idx) => ({
      ...cond,
      _id: `filter-${idx}-${cond.columnId}`,
    }))
  }, [filters.conditions])

  const handleAddCondition = useCallback(() => {
    if (columns.length === 0) return
    const column = columns[0]
    const isEnum = getColumnFilterType(column.id) === 'enum'
    const newCondition = createFilterCondition(column.id, column.type, isEnum)
    onFiltersChange({
      ...filters,
      conditions: [...filters.conditions, newCondition],
    })
  }, [columns, filters, onFiltersChange, getColumnFilterType])

  const handleRemoveCondition = useCallback((index: number) => {
    const newConditions = filters.conditions.filter((_, i) => i !== index)
    onFiltersChange({
      ...filters,
      conditions: newConditions,
    })
  }, [filters, onFiltersChange])

  const handleUpdateCondition = useCallback((index: number, updates: Partial<FilterCondition>) => {
    const newConditions = filters.conditions.map((cond, i) => {
      if (i !== index) return cond
      return { ...cond, ...updates }
    })
    onFiltersChange({
      ...filters,
      conditions: newConditions,
    })
  }, [filters, onFiltersChange])

  const handleColumnChange = useCallback((index: number, columnId: string) => {
    const column = columns.find(c => c.id === columnId)
    if (!column) return
    const isEnum = getColumnFilterType(columnId) === 'enum'
    const newCondition = createFilterCondition(columnId, column.type, isEnum)
    handleUpdateCondition(index, newCondition)
  }, [columns, handleUpdateCondition, getColumnFilterType])

  const handleToggleLogic = useCallback(() => {
    onFiltersChange({
      ...filters,
      logic: filters.logic === 'and' ? 'or' : 'and',
    })
  }, [filters, onFiltersChange])

  const handleClearAll = useCallback(() => {
    onFiltersChange({
      conditions: [],
      logic: 'and',
    })
  }, [onFiltersChange])

  const getColumnUniqueValues = useCallback((columnId: string) => {
    return engineUniqueValues[columnId]
      ?? getUniqueValues(rows, columnId, getDisplayValue, 100)
  }, [engineUniqueValues, rows, getDisplayValue])

  const percentage = totalRowCount > 0
    ? Math.min(100, Math.max(0, Math.round((matchingRowCount / totalRowCount) * 100)))
    : 100

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="join-overlay z-modal-backdrop motion-safe:animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-modal flex h-fit max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100vw-1rem)]
            -translate-x-1/2 -translate-y-1/2
            flex-col overflow-hidden rounded-xl border border-border-elevation bg-surface shadow-2xl motion-safe:animate-fade-in sm:max-w-xl"
        >
        <div className="border-b border-border-subtle px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              Filter Data
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-sm text-text-secondary">
              {initialColumnId
                ? `Editing conditions for ${columns.find(column => column.id === initialColumnId)?.name ?? 'this column'}. Results update instantly.`
                : 'Results update as you configure each condition.'}
            </Dialog.Description>
          </div>
          
          {filters.conditions.length > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-2.5">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-tertiary"
                role="progressbar"
                aria-label="Matching rows"
                aria-valuemin={0}
                aria-valuemax={totalRowCount}
                aria-valuenow={matchingRowCount}
                aria-valuetext={`${matchingRowCount.toLocaleString()} of ${totalRowCount.toLocaleString()} rows match`}
              >
                <div
                  className="h-full origin-left rounded-full bg-accent-green transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${percentage / 100})` }}
                />
              </div>
              <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-text-primary">
                {matchingRowCount.toLocaleString()} <span className="font-normal text-text-tertiary">of</span> {totalRowCount.toLocaleString()} rows
              </span>
            </div>
          )}
        </div>

        <div className="scrollbar-hide max-h-[min(28rem,calc(100dvh-13rem))] overflow-y-auto overscroll-contain bg-surface-secondary/40 p-3 sm:p-4">
          {filters.conditions.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-green/10">
                <svg className="h-6 w-6 text-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                </svg>
              </div>
              <p className="mb-1 text-base font-semibold text-text-primary">Show only the rows you need</p>
              <p className="mb-5 text-sm text-text-secondary">Start with a column, then choose a condition and value.</p>
              <button
                type="button"
                onClick={handleAddCondition}
                className="btn btn-primary gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add a filter
              </button>
            </div>
          )}

          {filters.conditions.length > 0 && (
            <div className="space-y-2">
              {filters.conditions.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">How should conditions combine?</p>
                    <p className="text-xs text-text-secondary">Show rows that match every condition or just one.</p>
                  </div>
                  <div className="grid grid-cols-2 rounded-md bg-surface-tertiary p-0.5" role="group" aria-label="Filter match mode">
                    <button
                      type="button"
                      onClick={() => filters.logic !== 'and' && handleToggleLogic()}
                      aria-pressed={filters.logic === 'and'}
                      className={`rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        filters.logic === 'and' ? 'bg-surface text-accent-text shadow-sm' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Match all
                    </button>
                    <button
                      type="button"
                      onClick={() => filters.logic !== 'or' && handleToggleLogic()}
                      aria-pressed={filters.logic === 'or'}
                      className={`rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        filters.logic === 'or' ? 'bg-surface text-accent-text shadow-sm' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Match any
                    </button>
                  </div>
                </div>
              )}

              {conditionsWithIds.map((condition, index) => {
                const column = columns.find(c => c.id === condition.columnId)
                const filterType = getColumnFilterType(condition.columnId)
                const operators = getOperatorsForType(filterType)
                const uniqueValues = getColumnUniqueValues(condition.columnId)
                const columnOptions = columns.map(col => ({ value: col.id, label: col.name }))

                const commonProps: FilterCardProps = {
                  condition,
                  index,
                  column,
                  filterType,
                  uniqueValues,
                  operators,
                  onUpdate: (updates) => handleUpdateCondition(index, updates),
                  onRemove: () => handleRemoveCondition(index),
                  onColumnChange: (colId) => handleColumnChange(index, colId),
                  columnOptions,
                }

                switch (filterType) {
                  case 'date':
                  case 'datetime':
                    return <DateFilterCard key={condition._id} {...commonProps} />
                  case 'number':
                    return <NumberFilterCard key={condition._id} {...commonProps} />
                  case 'boolean':
                    return <BooleanFilterCard key={condition._id} {...commonProps} />
                  case 'enum':
                    return <EnumFilterCard key={condition._id} {...commonProps} />
                  default:
                    return <StringFilterCard key={condition._id} {...commonProps} />
                }
              })}

              <button
                type="button"
                onClick={handleAddCondition}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md px-1 py-2 text-sm font-medium text-accent-text transition-colors hover:text-accent-text/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/30"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add filter
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border-subtle bg-surface px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={filters.conditions.length === 0}
              className="btn btn-ghost text-text-secondary hover:bg-surface-tertiary hover:text-text-primary
                disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            >
              Clear All
            </button>
            <Dialog.Close
              type="button"
              className="btn btn-primary px-6"
            >
              Done
            </Dialog.Close>
          </div>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
