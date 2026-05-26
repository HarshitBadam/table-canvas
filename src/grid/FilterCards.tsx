import { useState, useMemo } from 'react'
import { CellValue, ColumnSchema, FilterCondition, FilterOperator } from '@/types'
import {
  FilterColumnType,
  getOperatorLabel,
  QuickDateFilter,
  quickDateOptions,
} from './filterUtils'
import {
  CustomSelect,
  DateInput,
  DateRangeInput,
  QuickDateFilters,
  NumberInput,
  NumberRangeInput,
  BooleanToggle,
  EnumMultiSelect,
  StringInput,
} from './FilterInputs'

export interface FilterConditionWithId extends FilterCondition {
  _id: string
}

export interface FilterCardProps {
  condition: FilterConditionWithId
  index: number
  column?: ColumnSchema
  filterType: FilterColumnType
  uniqueValues: CellValue[]
  operators: FilterOperator[]
  onUpdate: (updates: Partial<FilterCondition>) => void
  onRemove: () => void
  onColumnChange: (columnId: string) => void
  columnOptions: { value: string; label: string }[]
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}


export function DateFilterCard({
  condition,
  index,
  operators,
  onUpdate,
  onRemove,
  onColumnChange,
  columnOptions,
}: FilterCardProps) {
  const [quickFilter, setQuickFilter] = useState<QuickDateFilter | null>(null)
  const operatorOptions = operators.map(op => ({ value: op, label: getOperatorLabel(op, 'date') }))
  const isBetween = condition.operator === 'between'
  const isNullCheck = condition.operator === 'is_null'

  const handleQuickFilter = (filter: QuickDateFilter) => {
    const option = quickDateOptions.find(o => o.id === filter)
    if (option) {
      const { start, end } = option.getRange()
      setQuickFilter(filter)
      onUpdate({ operator: 'between', value: start, value2: end })
    }
  }

  const handleDateChange = (val: string) => {
    setQuickFilter(null)
    onUpdate({ value: val })
  }

  const handleStartChange = (val: string) => {
    setQuickFilter(null)
    onUpdate({ value: val })
  }

  const handleEndChange = (val: string) => {
    setQuickFilter(null)
    onUpdate({ value2: val })
  }

  return (
    <div className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Date Filter</span>
        </div>
        <RemoveButton onClick={onRemove} />
      </div>

      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      <div className="mb-3">
        <QuickDateFilters
          selectedQuickFilter={quickFilter}
          onSelect={handleQuickFilter}
        />
      </div>

      <div className="space-y-2">
        <div className="w-full">
          <CustomSelect
            value={condition.operator}
            options={operatorOptions}
            onChange={(val) => {
              setQuickFilter(null)
              onUpdate({ operator: val as FilterOperator, value: '', value2: undefined })
            }}
            compact
          />
        </div>
        {!isNullCheck && (
          <div className="w-full">
            {isBetween ? (
              <DateRangeInput
                startValue={String(condition.value || '')}
                endValue={String(condition.value2 || '')}
                onStartChange={handleStartChange}
                onEndChange={handleEndChange}
              />
            ) : (
              <DateInput
                value={String(condition.value || '')}
                onChange={handleDateChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function NumberFilterCard({
  condition,
  index,
  operators,
  onUpdate,
  onRemove,
  onColumnChange,
  columnOptions,
}: FilterCardProps) {
  const operatorOptions = operators.map(op => ({ value: op, label: getOperatorLabel(op, 'number') }))
  const isBetween = condition.operator === 'between'
  const isNullCheck = condition.operator === 'is_null'

  return (
    <div className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Number Filter</span>
        </div>
        <RemoveButton onClick={onRemove} />
      </div>

      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      <div className="space-y-2">
        <div className="w-full">
          <CustomSelect
            value={condition.operator}
            options={operatorOptions}
            onChange={(val) => onUpdate({ operator: val as FilterOperator, value: '', value2: undefined })}
            compact
          />
        </div>
        {!isNullCheck && (
          <div className="w-full">
            {isBetween ? (
              <NumberRangeInput
                startValue={typeof condition.value === 'boolean' ? '' : (condition.value ?? '')}
                endValue={typeof condition.value2 === 'boolean' ? '' : (condition.value2 ?? '')}
                onStartChange={(val) => onUpdate({ value: val ? Number(val) : '' })}
                onEndChange={(val) => onUpdate({ value2: val ? Number(val) : undefined })}
              />
            ) : (
              <NumberInput
                value={typeof condition.value === 'boolean' ? '' : (condition.value ?? '')}
                onChange={(val) => onUpdate({ value: val ? Number(val) : '' })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function BooleanFilterCard({
  condition,
  index,
  onUpdate,
  onRemove,
  onColumnChange,
  columnOptions,
}: FilterCardProps) {
  return (
    <div className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Yes/No Filter</span>
        </div>
        <RemoveButton onClick={onRemove} />
      </div>

      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      <BooleanToggle
        value={String(condition.value)}
        onChange={(val) => onUpdate({ value: val })}
      />
    </div>
  )
}

export function EnumFilterCard({
  condition,
  index,
  uniqueValues,
  onUpdate,
  onRemove,
  onColumnChange,
  columnOptions,
}: FilterCardProps) {
  // '|||' is the delimiter used to serialize multiple selected values into a single string
  const selectedValues = useMemo(() => {
    if (!condition.value) return []
    return String(condition.value).split('|||').filter(Boolean)
  }, [condition.value])

  const handleChange = (values: string[]) => {
    onUpdate({ value: values.join('|||') })
  }

  return (
    <div className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide">Select Values</span>
        </div>
        <RemoveButton onClick={onRemove} />
      </div>

      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      <EnumMultiSelect
        selectedValues={selectedValues}
        availableValues={uniqueValues}
        onChange={handleChange}
      />
    </div>
  )
}

export function StringFilterCard({
  condition,
  index,
  operators,
  onUpdate,
  onRemove,
  onColumnChange,
  columnOptions,
}: FilterCardProps) {
  const operatorOptions = operators.map(op => ({ value: op, label: getOperatorLabel(op, 'string') }))
  const isNullCheck = condition.operator === 'is_null'

  return (
    <div className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Text Filter</span>
        </div>
        <RemoveButton onClick={onRemove} />
      </div>

      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      <div className="space-y-2">
        <div className="w-full">
          <CustomSelect
            value={condition.operator}
            options={operatorOptions}
            onChange={(val) => onUpdate({ operator: val as FilterOperator, value: '' })}
            compact
          />
        </div>
        {!isNullCheck && (
          <div className="w-full">
            <StringInput
              value={String(condition.value || '')}
              onChange={(val) => onUpdate({ value: val })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
