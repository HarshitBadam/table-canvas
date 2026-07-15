import { QuickDateFilter, quickDateOptions } from './filterUtils'

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
        focus:border-accent-green
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
          focus:border-accent-green
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
          focus:border-accent-green
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
              ? 'bg-accent-green text-white'
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
