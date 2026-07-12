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

const ENUM_VALUE_DELIMITER = '|||'

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
      type="button"
      onClick={onClick}
      aria-label="Remove filter"
      className="rounded-lg p-1.5 text-error-text transition-colors hover:bg-error-light"
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
    <div className="relative rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-green/10 text-xs font-semibold text-accent-text">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-text-secondary">Date filter</span>
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
    <div className="relative rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-green/10 text-xs font-semibold text-accent-text">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-text-secondary">Number filter</span>
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
    <div className="relative rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-green/10 text-xs font-semibold text-accent-text">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-text-secondary">Yes/no filter</span>
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
  const selectedValues = useMemo(() => {
    if (!condition.value) return []
    return String(condition.value).split(ENUM_VALUE_DELIMITER).filter(Boolean)
  }, [condition.value])

  const handleChange = (values: string[]) => {
    onUpdate({ value: values.join(ENUM_VALUE_DELIMITER) })
  }

  return (
    <div className="relative rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-green/10 text-xs font-semibold text-accent-text">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-text-secondary">Select values</span>
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
    <div className="relative rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-green/10 text-xs font-semibold text-accent-text">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-text-secondary">Text filter</span>
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
