import { useCallback, useMemo, useRef } from 'react'
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
  const panelRef = useRef<HTMLDivElement>(null)

  const columnUniqueValueCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    columns.forEach(col => {
      counts[col.id] = countUniqueValues(rows, col.id, getDisplayValue)
    })
    return counts
  }, [columns, rows, getDisplayValue])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      <div 
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-data-title"
        className="relative w-full max-w-xl max-h-[85vh]
          bg-gray-50 dark:bg-gray-900
          rounded-2xl shadow-2xl
          border border-gray-200 dark:border-gray-800
          overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="px-6 pt-6 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="filter-data-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Filter Data
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Narrow down your results
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddCondition}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white
                  bg-emerald-700 hover:bg-emerald-800
                  rounded-lg
                  active:scale-[0.98] transition-all duration-150"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Filter
              </button>
              <button
                onClick={onClose}
                aria-label="Close filter panel"
                autoFocus
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200
                  hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-150"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {filters.conditions.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <div
                className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Matching rows"
                aria-valuemin={0}
                aria-valuemax={totalRowCount}
                aria-valuenow={matchingRowCount}
              >
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums whitespace-nowrap">
                {matchingRowCount.toLocaleString()} <span className="text-gray-400 font-normal">of</span> {totalRowCount.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filters.conditions.length === 0 && (
            <div className="py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">No filters applied</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Showing all {totalRowCount.toLocaleString()} rows</p>
              <button
                onClick={handleAddCondition}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white
                  bg-emerald-700 hover:bg-emerald-800
                  rounded-lg
                  active:scale-[0.98] transition-all duration-150"
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
                <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Match</span>
                  <button
                    onClick={handleToggleLogic}
                    className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide
                      bg-emerald-700 text-white rounded-md
                      hover:bg-emerald-800 active:scale-[0.97]
                      transition-all duration-150"
                  >
                    {filters.logic === 'and' ? 'all' : 'any'}
                  </button>
                  <span className="text-sm text-gray-500 dark:text-gray-400">of these conditions</span>
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
                className="w-full py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400
                  bg-gray-100 dark:bg-gray-800 rounded-lg
                  hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30
                  active:scale-[0.99]
                  transition-all duration-150 flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Another Filter
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleClearAll}
              disabled={filters.conditions.length === 0}
              className="px-4 py-2 text-sm font-medium text-gray-500
                hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20
                disabled:opacity-40 disabled:hover:text-gray-500 disabled:hover:bg-transparent
                rounded-lg transition-all duration-150"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-semibold text-white
                bg-emerald-700 hover:bg-emerald-800
                rounded-lg
                active:scale-[0.98] transition-all duration-150"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
