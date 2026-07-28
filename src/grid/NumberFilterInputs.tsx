export function NumberInput({
  value,
  onChange,
  placeholder = 'Enter number',
  className = '',
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Filter number"
      className={`h-10 w-full rounded-lg border border-border bg-surface-secondary px-3 font-mono text-sm text-text-primary
        placeholder:text-text-tertiary transition-colors hover:border-text-tertiary focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-accent-green/30 ${className}`}
    />
  )
}

export function NumberRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  className = '',
}: {
  startValue: string | number
  endValue: string | number
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  className?: string
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
      <input
        type="number"
        value={startValue}
        onChange={(e) => onStartChange(e.target.value)}
        placeholder="Min"
        aria-label="Minimum value"
        className={`h-10 w-full min-w-0 rounded-lg border border-border bg-surface-secondary px-3 font-mono text-sm text-text-primary
          placeholder:text-text-tertiary transition-colors hover:border-text-tertiary focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-accent-green/30 ${className}`}
      />
      <span className="hidden shrink-0 text-sm text-text-tertiary sm:inline">to</span>
      <input
        type="number"
        value={endValue}
        onChange={(e) => onEndChange(e.target.value)}
        placeholder="Max"
        aria-label="Maximum value"
        className={`h-10 w-full min-w-0 rounded-lg border border-border bg-surface-secondary px-3 font-mono text-sm text-text-primary
          placeholder:text-text-tertiary transition-colors hover:border-text-tertiary focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-accent-green/30 ${className}`}
      />
    </div>
  )
}
