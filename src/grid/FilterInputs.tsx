import { useState, useEffect, useRef } from 'react'

export { DateInput, DateRangeInput, QuickDateFilters } from './DateFilterInputs'
export { NumberInput, NumberRangeInput } from './NumberFilterInputs'
export { EnumMultiSelect } from './EnumMultiSelect'

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
