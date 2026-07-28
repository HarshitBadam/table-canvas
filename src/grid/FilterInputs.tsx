import * as Select from '@radix-ui/react-select'

export { DateInput, DateRangeInput, QuickDateFilters } from './DateFilterInputs'
export { NumberInput, NumberRangeInput } from './NumberFilterInputs'
export { EnumMultiSelect } from './EnumMultiSelect'

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  compact = false,
  className = '',
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
  compact?: boolean
  className?: string
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={placeholder === 'Select...' ? 'Choose an option' : placeholder}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-md bg-surface-secondary px-3 text-left text-sm font-medium text-text-primary outline-none transition-[background-color,box-shadow] hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-accent-green/30 ${compact ? '!h-9' : ''} ${className}`}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="shrink-0 text-text-tertiary">
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className="z-popover min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg bg-surface shadow-lg ring-1 ring-border-elevation motion-safe:animate-scale-in"
        >
          <Select.Viewport>
            {options.map(option => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="flex min-h-10 w-full cursor-pointer select-none items-center px-3 text-sm font-medium text-text-secondary outline-none transition-colors hover:bg-surface-tertiary hover:text-text-primary data-[highlighted]:bg-surface-tertiary data-[highlighted]:text-text-primary data-[state=checked]:text-accent-text"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} />
    </svg>
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
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-tertiary p-1" role="group" aria-label="Boolean value">
      <button
        type="button"
        onClick={() => onChange('true')}
        aria-pressed={isTrue}
        className={`
          flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-150
          ${isTrue
            ? 'bg-accent-green text-white shadow-sm'
            : 'text-text-secondary hover:bg-surface hover:text-text-primary'
          }
        `}
      >
        True
      </button>
      <button
        type="button"
        onClick={() => onChange('false')}
        aria-pressed={!isTrue}
        className={`
          flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-150
          ${!isTrue
            ? 'bg-accent-green text-white shadow-sm'
            : 'text-text-secondary hover:bg-surface hover:text-text-primary'
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
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Filter value"
      className={`h-10 w-full rounded-lg border border-border bg-surface-secondary px-3 text-sm text-text-primary
        placeholder:text-text-tertiary transition-colors hover:border-text-tertiary focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-accent-green/30 ${className}`}
    />
  )
}
