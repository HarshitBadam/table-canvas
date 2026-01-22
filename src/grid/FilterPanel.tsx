import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { CellValue, ColumnSchema, FilterCondition, FilterOperator } from '@/lib/types'
import {
  GridFilterConfig,
  FilterColumnType,
  getOperatorsForType,
  getOperatorLabel,
  createFilterCondition,
  getUniqueValues,
  countUniqueValues,
  getEffectiveFilterType,
  quickDateOptions,
  QuickDateFilter,
} from './filterUtils'

interface FilterPanelProps {
  isOpen: boolean
  onClose: () => void
  columns: ColumnSchema[]
  filters: GridFilterConfig
  onFiltersChange: (filters: GridFilterConfig) => void
  rows: Array<{ __rowId: string; [key: string]: CellValue }>
  getDisplayValue: (rowId: string, colId: string, base: CellValue) => CellValue
  matchingRowCount: number
  totalRowCount: number
}

interface FilterConditionWithId extends FilterCondition {
  _id: string
}

// ============================================================================
// Shared Components
// ============================================================================

function CustomSelect({ 
  value, 
  options, 
  onChange, 
  placeholder = 'Select...',
  compact = false,
}: { 
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
  compact?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-2
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700 rounded-lg
          text-gray-900 dark:text-gray-100 text-sm font-medium
          transition-all duration-150
          hover:border-gray-300 dark:hover:border-gray-600
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
          ${compact ? 'h-9 px-3' : 'h-10 px-3'}
          ${isOpen ? 'ring-2 ring-emerald-500/20 border-emerald-500' : ''}
        `}
      >
        <span className={`truncate ${!selectedOption ? 'text-gray-400' : ''}`}>
          {selectedOption?.label || placeholder}
        </span>
        <svg 
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700
          rounded-lg shadow-lg
          py-1 overflow-hidden"
        >
          <div className="max-h-[200px] overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`
                  w-full px-3 py-2 text-left text-sm transition-colors duration-100
                  ${value === option.value 
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-medium' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Type-Specific Input Components
// ============================================================================

// Date Input with native date picker
function DateInput({
  value,
  onChange,
  placeholder = 'Select date',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 px-3 text-sm
        bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700 rounded-lg
        text-gray-900 dark:text-gray-100
        focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
        transition-all duration-150
        [&::-webkit-calendar-picker-indicator]:dark:invert"
    />
  )
}

// Date Range Input (for "between" operator)
function DateRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <input
        type="date"
        value={startValue}
        onChange={(e) => onStartChange(e.target.value)}
        className="w-full min-w-0 h-10 px-3 text-sm
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700 rounded-lg
          text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
          transition-all duration-150
          [&::-webkit-calendar-picker-indicator]:dark:invert"
      />
      <span className="text-gray-400 text-sm shrink-0">to</span>
      <input
        type="date"
        value={endValue}
        onChange={(e) => onEndChange(e.target.value)}
        className="w-full min-w-0 h-10 px-3 text-sm
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700 rounded-lg
          text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
          transition-all duration-150
          [&::-webkit-calendar-picker-indicator]:dark:invert"
      />
    </div>
  )
}

// Quick Date Filter Pills
function QuickDateFilters({
  selectedQuickFilter,
  onSelect,
}: {
  selectedQuickFilter: QuickDateFilter | null
  onSelect: (filter: QuickDateFilter) => void
}) {
  // Show a subset of the most useful quick filters
  const displayFilters = quickDateOptions.slice(0, 6)
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {displayFilters.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelect(option.id)}
          className={`
            px-2.5 py-1 text-xs font-medium rounded-md
            transition-all duration-150
            ${selectedQuickFilter === option.id
              ? 'bg-emerald-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Number Input
function NumberInput({
  value,
  onChange,
  placeholder = 'Enter number',
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 px-3 text-sm font-mono
        bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700 rounded-lg
        text-gray-900 dark:text-gray-100
        focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
        transition-all duration-150"
    />
  )
}

// Number Range Input (for "between" operator)
function NumberRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: {
  startValue: string | number
  endValue: string | number
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <input
        type="number"
        value={startValue}
        onChange={(e) => onStartChange(e.target.value)}
        placeholder="Min"
        className="w-full min-w-0 h-10 px-3 text-sm font-mono
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700 rounded-lg
          text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
          transition-all duration-150"
      />
      <span className="text-gray-400 text-sm shrink-0">to</span>
      <input
        type="number"
        value={endValue}
        onChange={(e) => onEndChange(e.target.value)}
        placeholder="Max"
        className="w-full min-w-0 h-10 px-3 text-sm font-mono
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700 rounded-lg
          text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
          transition-all duration-150"
      />
    </div>
  )
}

// Boolean Toggle (no operator needed)
function BooleanToggle({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const isTrue = value === 'true' || value === 'True'
  
  return (
    <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
      <button
        onClick={() => onChange('true')}
        className={`
          flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-150
          ${isTrue
            ? 'bg-emerald-500 text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }
        `}
      >
        True
      </button>
      <button
        onClick={() => onChange('false')}
        className={`
          flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-150
          ${!isTrue
            ? 'bg-emerald-500 text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }
        `}
      >
        False
      </button>
    </div>
  )
}

// Enum Multi-Select (checkboxes for all unique values)
function EnumMultiSelect({
  selectedValues,
  availableValues,
  onChange,
}: {
  selectedValues: string[]
  availableValues: CellValue[]
  onChange: (values: string[]) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  
  const filteredValues = useMemo(() => {
    if (!searchTerm) return availableValues
    const term = searchTerm.toLowerCase()
    return availableValues.filter(v => String(v).toLowerCase().includes(term))
  }, [availableValues, searchTerm])

  const toggleValue = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val))
    } else {
      onChange([...selectedValues, val])
    }
  }

  const selectAll = () => {
    const allValues = availableValues.map(v => String(v))
    onChange(allValues)
  }

  const clearAll = () => {
    onChange([])
  }

  return (
    <div className="space-y-2">
      {/* Search and bulk actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full h-8 pl-8 pr-3 text-sm
              bg-white dark:bg-gray-800
              border border-gray-200 dark:border-gray-700 rounded-md
              text-gray-900 dark:text-gray-100 placeholder:text-gray-400
              focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
              transition-all duration-150"
          />
        </div>
        <button
          onClick={selectAll}
          className="px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded"
        >
          All
        </button>
        <button
          onClick={clearAll}
          className="px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          Clear
        </button>
      </div>

      {/* Selected chips */}
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedValues.slice(0, 5).map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1 px-2 py-0.5 
                bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full"
            >
              {val}
              <button
                onClick={() => toggleValue(val)}
                className="hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-full p-0.5 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {selectedValues.length > 5 && (
            <span className="px-2 py-0.5 text-xs text-gray-500">
              +{selectedValues.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Checkbox list */}
      <div className="max-h-[160px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
        {filteredValues.length === 0 ? (
          <div className="p-3 text-center text-sm text-gray-400">
            No values found
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredValues.map((val, i) => {
              const strVal = String(val)
              const isSelected = selectedValues.includes(strVal)
              return (
                <label
                  key={i}
                  className={`
                    flex items-center gap-2.5 px-3 py-2 cursor-pointer
                    transition-colors duration-100
                    ${isSelected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleValue(strVal)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 
                      text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0
                      cursor-pointer"
                  />
                  <span className={`text-sm ${isSelected ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                    {strVal}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// String Input
function StringInput({
  value,
  onChange,
  placeholder = 'Enter text',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 px-3 text-sm
        bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700 rounded-lg
        text-gray-900 dark:text-gray-100 placeholder:text-gray-400
        focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
        transition-all duration-150"
    />
  )
}

// ============================================================================
// Filter Card Components (Type-Specific)
// ============================================================================

interface FilterCardProps {
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

// Date Filter Card
function DateFilterCard({
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
      {/* Header with filter number and remove button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Date Filter</span>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Column selector */}
      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      {/* Quick date filters */}
      <div className="mb-3">
        <QuickDateFilters
          selectedQuickFilter={quickFilter}
          onSelect={handleQuickFilter}
        />
      </div>

      {/* Operator and Value */}
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

// Number Filter Card
function NumberFilterCard({
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
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Number Filter</span>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Column selector */}
      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      {/* Operator and Value */}
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

// Boolean Filter Card (simplified - just toggle)
function BooleanFilterCard({
  condition,
  index,
  onUpdate,
  onRemove,
  onColumnChange,
  columnOptions,
}: FilterCardProps) {
  return (
    <div className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Yes/No Filter</span>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Column selector */}
      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      {/* Boolean Toggle */}
      <BooleanToggle
        value={String(condition.value)}
        onChange={(val) => onUpdate({ value: val })}
      />
    </div>
  )
}

// Enum Filter Card (multi-select checkboxes)
function EnumFilterCard({
  condition,
  index,
  uniqueValues,
  onUpdate,
  onRemove,
  onColumnChange,
  columnOptions,
}: FilterCardProps) {
  // Parse selected values from the condition
  const selectedValues = useMemo(() => {
    if (!condition.value) return []
    return String(condition.value).split('|||').filter(Boolean)
  }, [condition.value])

  const handleChange = (values: string[]) => {
    onUpdate({ value: values.join('|||') })
  }

  return (
    <div className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide">Select Values</span>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Column selector */}
      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      {/* Multi-select checkboxes */}
      <EnumMultiSelect
        selectedValues={selectedValues}
        availableValues={uniqueValues}
        onChange={handleChange}
      />
    </div>
  )
}

// String Filter Card
function StringFilterCard({
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
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-full">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Text Filter</span>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Column selector */}
      <div className="mb-3">
        <CustomSelect
          value={condition.columnId}
          options={columnOptions}
          onChange={onColumnChange}
          compact
        />
      </div>

      {/* Operator and Value */}
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

// ============================================================================
// Main Filter Panel
// ============================================================================

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

  // Cache unique value counts for enum detection
  const columnUniqueValueCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    columns.forEach(col => {
      counts[col.id] = countUniqueValues(rows, col.id, getDisplayValue)
    })
    return counts
  }, [columns, rows, getDisplayValue])

  // Get filter type for a column (including enum detection)
  const getColumnFilterType = useCallback((columnId: string): FilterColumnType => {
    const column = columns.find(c => c.id === columnId)
    if (!column) return 'string'
    return getEffectiveFilterType(column.type, columnUniqueValueCounts[columnId] || 0)
  }, [columns, columnUniqueValueCounts])

  // Add internal IDs for React keys
  const conditionsWithIds: FilterConditionWithId[] = useMemo(() => {
    return filters.conditions.map((cond, idx) => ({
      ...cond,
      _id: `filter-${idx}-${cond.columnId}`,
    }))
  }, [filters.conditions])

  // Add a new filter condition
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

  // Remove a filter condition
  const handleRemoveCondition = useCallback((index: number) => {
    const newConditions = filters.conditions.filter((_, i) => i !== index)
    onFiltersChange({
      ...filters,
      conditions: newConditions,
    })
  }, [filters, onFiltersChange])

  // Update a filter condition
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

  // Change column and reset operator/value
  const handleColumnChange = useCallback((index: number, columnId: string) => {
    const column = columns.find(c => c.id === columnId)
    if (!column) return
    const isEnum = getColumnFilterType(columnId) === 'enum'
    const newCondition = createFilterCondition(columnId, column.type, isEnum)
    handleUpdateCondition(index, newCondition)
  }, [columns, handleUpdateCondition, getColumnFilterType])

  // Toggle logic (AND/OR)
  const handleToggleLogic = useCallback(() => {
    onFiltersChange({
      ...filters,
      logic: filters.logic === 'and' ? 'or' : 'and',
    })
  }, [filters, onFiltersChange])

  // Clear all filters
  const handleClearAll = useCallback(() => {
    onFiltersChange({
      conditions: [],
      logic: 'and',
    })
  }, [onFiltersChange])

  // Get unique values for a column
  const getColumnUniqueValues = useCallback((columnId: string) => {
    return getUniqueValues(rows, columnId, getDisplayValue, 100)
  }, [rows, getDisplayValue])

  if (!isOpen) return null

  const percentage = totalRowCount > 0 ? Math.round((matchingRowCount / totalRowCount) * 100) : 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      {/* Panel */}
      <div 
        ref={panelRef}
        className="relative w-full max-w-xl max-h-[85vh]
          bg-gray-50 dark:bg-gray-900
          rounded-2xl shadow-2xl
          border border-gray-200 dark:border-gray-800
          overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
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
                  bg-emerald-500 hover:bg-emerald-600
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
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200
                  hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-150"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Results indicator */}
          {filters.conditions.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Empty state */}
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
                  bg-emerald-500 hover:bg-emerald-600
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

          {/* Filter conditions */}
          {filters.conditions.length > 0 && (
            <div className="space-y-3">
              {/* Logic toggle */}
              {filters.conditions.length > 1 && (
                <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Match</span>
                  <button
                    onClick={handleToggleLogic}
                    className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide
                      bg-emerald-500 text-white rounded-md
                      hover:bg-emerald-600 active:scale-[0.97]
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

                // Render type-specific filter card
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

              {/* Add another filter button */}
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

        {/* Footer */}
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
                bg-emerald-500 hover:bg-emerald-600
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
