import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { CellValue, FilterCondition, FilterOperator } from '@/types'
import {
  getOperatorLabel,
  QuickDateFilter,
  quickDateOptions,
} from '../filterUtils'
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
      className="canvas-touch-target rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

function FilterConditionRow({
  index,
  onRemove,
  columnControl,
  operatorControl,
  valueControl,
  wideValue = false,
  isUnary = false,
  children,
}: {
  index: number
  onRemove: () => void
  columnControl: ReactNode
  operatorControl?: ReactNode
  valueControl?: ReactNode
  wideValue?: boolean
  isUnary?: boolean
  children?: ReactNode
}) {
  return (
    <fieldset className="group">
      <legend className="sr-only">Filter condition {index + 1}</legend>
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-stretch overflow-hidden rounded-lg border border-border bg-surface ${
        isUnary
          ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
          : 'sm:grid-cols-[minmax(9rem,1fr)_minmax(8rem,0.8fr)_minmax(11rem,1.2fr)_auto]'
      }`}>
        <label className="flex min-w-0 items-center border-b border-border-subtle px-1.5 py-1 sm:border-b-0 sm:border-r">
          <span className="sr-only">Column</span>
          {columnControl}
        </label>
        {operatorControl && (
          <label className={`flex min-w-0 items-center border-b border-border-subtle px-1.5 py-1 sm:border-b-0 ${isUnary ? '' : 'sm:border-r'}`}>
            <span className="sr-only">Condition</span>
            {operatorControl}
          </label>
        )}
        {valueControl && (
          <div className={`flex min-w-0 items-center px-1.5 py-1 ${wideValue ? 'col-span-2' : ''}`}>
            <span className="sr-only">Value</span>
            {valueControl}
          </div>
        )}
        <div className="flex self-stretch items-center px-1">
          <RemoveButton onClick={onRemove} />
        </div>
      </div>
      {children}
    </fieldset>
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

  useEffect(() => {
    if (condition.operator !== 'between') {
      setQuickFilter(null)
      return
    }
    const matchingPreset = quickDateOptions.find(option => {
      const range = option.getRange()
      return range.start === String(condition.value ?? '') && range.end === String(condition.value2 ?? '')
    })
    setQuickFilter(matchingPreset?.id ?? null)
  }, [condition.operator, condition.value, condition.value2])

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
    <FilterConditionRow
      index={index}
      onRemove={onRemove}
      columnControl={
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          placeholder="Choose a column"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      operatorControl={
        <CustomSelect
          value={condition.operator}
          options={operatorOptions}
          onChange={(val) => {
            setQuickFilter(null)
            onUpdate({ operator: val as FilterOperator, value: '', value2: undefined })
          }}
          placeholder="Choose a condition"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      valueControl={!isNullCheck && (
        isBetween ? (
          <DateRangeInput
            startValue={String(condition.value || '')}
            endValue={String(condition.value2 || '')}
            onStartChange={handleStartChange}
            onEndChange={handleEndChange}
            className="filter-value-input !border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface focus-visible:!ring-0"
          />
        ) : (
          <DateInput value={String(condition.value || '')} onChange={handleDateChange} className="filter-value-input !border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface focus-visible:!ring-0" />
        )
      )}
      isUnary={isNullCheck}
    >
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-text-tertiary">Quickly set a range</span>
        <QuickDateFilters selectedQuickFilter={quickFilter} onSelect={handleQuickFilter} />
      </div>
    </FilterConditionRow>
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
    <FilterConditionRow
      index={index}
      onRemove={onRemove}
      columnControl={
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          placeholder="Choose a column"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      operatorControl={
        <CustomSelect
          value={condition.operator}
          options={operatorOptions}
          onChange={(val) => onUpdate({ operator: val as FilterOperator, value: '', value2: undefined })}
          placeholder="Choose a condition"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      valueControl={!isNullCheck && (
        isBetween ? (
          <NumberRangeInput
            startValue={typeof condition.value === 'boolean' ? '' : (condition.value ?? '')}
            endValue={typeof condition.value2 === 'boolean' ? '' : (condition.value2 ?? '')}
            onStartChange={(val) => onUpdate({ value: val ? Number(val) : '' })}
            onEndChange={(val) => onUpdate({ value2: val ? Number(val) : undefined })}
            className="filter-value-input !border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface focus-visible:!ring-0"
          />
        ) : (
          <NumberInput
            value={typeof condition.value === 'boolean' ? '' : (condition.value ?? '')}
            onChange={(val) => onUpdate({ value: val ? Number(val) : '' })}
            className="filter-value-input !border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface focus-visible:!ring-0"
          />
        )
      )}
      isUnary={isNullCheck}
    />
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
    <FilterConditionRow
      index={index}
      onRemove={onRemove}
      columnControl={
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          placeholder="Choose a column"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      valueControl={
        <BooleanToggle
          value={String(condition.value)}
          onChange={(val) => onUpdate({ value: val })}
        />
      }
    />
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
    <FilterConditionRow
      index={index}
      onRemove={onRemove}
      columnControl={
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          placeholder="Choose a column"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      valueControl={
        <EnumMultiSelect
          selectedValues={selectedValues}
          availableValues={uniqueValues}
          onChange={handleChange}
        />
      }
      wideValue
    />
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
    <FilterConditionRow
      index={index}
      onRemove={onRemove}
      columnControl={
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          placeholder="Choose a column"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      operatorControl={
        <CustomSelect
          value={condition.operator}
          options={operatorOptions}
          onChange={(val) => onUpdate({ operator: val as FilterOperator, value: '' })}
          placeholder="Choose a condition"
          compact
          className="!border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface"
        />
      }
      valueControl={!isNullCheck && (
        <StringInput
          value={String(condition.value || '')}
          onChange={(val) => onUpdate({ value: val })}
          className="filter-value-input !border-0 !bg-transparent !shadow-none hover:!bg-surface focus-visible:!bg-surface focus-visible:!ring-0"
        />
      )}
      isUnary={isNullCheck}
    />
  )
}
