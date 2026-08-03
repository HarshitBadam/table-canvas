import { QuickDateFilter, quickDateOptions } from '../filterUtils'

export function DateInput({
  value,
  onChange,
  placeholder = 'Select date',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Filter date"
      className={`h-10 w-full rounded-lg border border-border bg-surface-secondary px-3 text-sm text-text-primary
        transition-colors hover:border-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/30
        [&::-webkit-calendar-picker-indicator]:dark:invert ${className}`}
    />
  )
}

export function DateRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  className = '',
}: {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  className?: string
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
      <input
        type="date"
        value={startValue}
        onChange={(e) => onStartChange(e.target.value)}
        aria-label="Start date"
        className={`h-10 w-full min-w-0 rounded-lg border border-border bg-surface-secondary px-3 text-sm text-text-primary
          transition-colors hover:border-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/30
          [&::-webkit-calendar-picker-indicator]:dark:invert ${className}`}
      />
      <span className="hidden shrink-0 text-sm text-text-tertiary sm:inline">to</span>
      <input
        type="date"
        value={endValue}
        onChange={(e) => onEndChange(e.target.value)}
        aria-label="End date"
        className={`h-10 w-full min-w-0 rounded-lg border border-border bg-surface-secondary px-3 text-sm text-text-primary
          transition-colors hover:border-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/30
          [&::-webkit-calendar-picker-indicator]:dark:invert ${className}`}
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
          type="button"
          onClick={() => onSelect(option.id)}
          aria-pressed={selectedQuickFilter === option.id}
          className={`
            px-2.5 py-1 text-xs font-medium rounded-md
            transition-all duration-150
            ${selectedQuickFilter === option.id
              ? 'bg-accent-green text-white'
              : 'bg-surface-tertiary text-text-secondary hover:bg-surface hover:text-text-primary'
            }
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
