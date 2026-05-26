import { useState, useEffect, useRef, useMemo } from 'react'
import { CellValue } from '@/types'
import { QuickDateFilter, quickDateOptions } from './filterUtils'

export function CustomSelect({
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

export function DateInput({
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

export function DateRangeInput({
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

export function QuickDateFilters({
  selectedQuickFilter,
  onSelect,
}: {
  selectedQuickFilter: QuickDateFilter | null
  onSelect: (filter: QuickDateFilter) => void
}) {
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

export function NumberInput({
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

export function NumberRangeInput({
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

export function BooleanToggle({
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

export function EnumMultiSelect({
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

export function StringInput({
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
