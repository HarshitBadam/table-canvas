import { useCallback, useMemo } from 'react'
import { useDialogFocus } from '@/components/useDialogFocus'
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
  isOpen: boolean
  onClose: () => void
  columns: ColumnSchema[]
  filters: ViewFilterConfig
  onFiltersChange: (filters: ViewFilterConfig) => void
  rows: Array<{ __rowId: string; [key: string]: CellValue }>
  getDisplayValue: (rowId: string, colId: string, base: CellValue) => CellValue
  matchingRowCount: number
  totalRowCount: number
}

export function FilterPanel({
  isOpen,
  onClose,
  columns,
  filters,
  onFiltersChange,
  rows,
  getDisplayValue,
  matchingRowCount,
  totalRowCount,
}: FilterPanelProps) {
  const panelRef = useDialogFocus<HTMLDivElement>(isOpen, onClose)

  const columnUniqueValueCounts = useMemo(() => {
    if (!isOpen) return {}

    const counts: Record<string, number> = {}
    columns.forEach(col => {
      counts[col.id] = countUniqueValues(rows, col.id, getDisplayValue)
    })
    return counts
  }, [columns, getDisplayValue, isOpen, rows])

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
    return getUniqueValues(rows, columnId, getDisplayValue, 100)
  }, [rows, getDisplayValue])

  if (!isOpen) return null

  const percentage = totalRowCount > 0 ? Math.round((matchingRowCount / totalRowCount) * 100) : 100

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      
      <div 
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-data-title"
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col
          overflow-hidden rounded-xl border border-border-elevation bg-surface-secondary shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border bg-surface px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="filter-data-title" className="text-base font-semibold text-text-primary">
                Filter Data
              </h2>
              <p className="mt-0.5 text-sm text-text-secondary">
                Narrow down your results
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close filter panel"
              data-dialog-initial-focus
              className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg text-text-tertiary
                transition-colors duration-150 hover:bg-surface-secondary hover:text-text-primary sm:min-h-9 sm:min-w-9"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {filters.conditions.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-tertiary"
                role="progressbar"
                aria-label="Matching rows"
                aria-valuemin={0}
                aria-valuemax={totalRowCount}
                aria-valuenow={matchingRowCount}
              >
                <div 
                  className="h-full origin-left rounded-full bg-accent-green transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${percentage / 100})` }}
                />
              </div>
              <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-text-primary">
                {matchingRowCount.toLocaleString()} <span className="font-normal text-text-tertiary">of</span> {totalRowCount.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {filters.conditions.length === 0 && (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-green/10">
                <svg className="h-6 w-6 text-accent-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                </svg>
              </div>
              <p className="mb-1 text-base font-semibold text-text-primary">No filters applied</p>
              <p className="mb-5 text-sm text-text-secondary">Showing all {totalRowCount.toLocaleString()} rows</p>
              <button
                onClick={handleAddCondition}
                className="btn btn-primary gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Your First Filter
              </button>
            </div>
          )}

          {filters.conditions.length > 0 && (
            <div className="space-y-3">
              {filters.conditions.length > 1 && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
                  <span className="text-sm text-text-secondary">Match</span>
                  <button
                    onClick={handleToggleLogic}
                    className="rounded-md bg-accent-green px-3 py-1.5 text-xs font-semibold text-white
                      transition-colors duration-150 hover:bg-accent-green-hover"
                  >
                    {filters.logic === 'and' ? 'all' : 'any'}
                  </button>
                  <span className="text-sm text-text-secondary">of these conditions</span>
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
                onClick={handleAddCondition}
                className="btn btn-secondary flex w-full items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Another Filter
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-surface px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleClearAll}
              disabled={filters.conditions.length === 0}
              className="btn btn-ghost text-text-secondary hover:bg-error-light hover:text-error-text
                disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="btn btn-primary px-6"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
