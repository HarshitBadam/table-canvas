import * as Select from '@radix-ui/react-select'

interface SelectFieldOption {
  value: string
  label: string
}

interface SelectFieldProps {
  value: string
  options: SelectFieldOption[]
  onValueChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function SelectField({
  value,
  options,
  onValueChange,
  ariaLabel,
  placeholder = 'Choose an option',
  disabled = false,
  className = '',
}: SelectFieldProps) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        aria-label={ariaLabel}
        className={`flex h-10 w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-left text-sm text-text-primary shadow-sm outline-none transition-colors hover:border-text-tertiary focus:border-accent-green disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
          className="z-popover max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg motion-safe:animate-scale-in"
        >
          <Select.Viewport>
            {options.map(option => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="relative flex min-h-9 cursor-default select-none items-center rounded-md py-2 pl-3 pr-9 text-sm text-text-primary outline-none transition-colors data-[highlighted]:bg-surface-tertiary data-[state=checked]:bg-accent-green/10 data-[state=checked]:font-medium data-[state=checked]:text-accent-text"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-3 text-accent-green">
                  <CheckIcon />
                </Select.ItemIndicator>
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
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} />
    </svg>
  )
}
