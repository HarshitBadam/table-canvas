import * as Select from '@radix-ui/react-select'
import type { ColumnType } from '@/types'

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'date', label: 'Date' },
]

interface ColumnTypeDropdownProps {
  value: ColumnType
  onChange: (value: ColumnType) => void
  ariaLabel: string
}

export function ColumnTypeDropdown({ value, onChange, ariaLabel }: ColumnTypeDropdownProps) {
  return (
    <Select.Root value={value} onValueChange={(nextValue) => onChange(nextValue as ColumnType)}>
      <Select.Trigger
        aria-label={ariaLabel}
        className="flex min-w-24 items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-xs font-semibold text-text-primary shadow-sm outline-none transition-[background-color,box-shadow] hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-accent-green/30"
      >
        <Select.Value />
        <Select.Icon className="text-text-tertiary">
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
            {COLUMN_TYPES.map(type => (
              <Select.Item
                key={type.value}
                value={type.value}
                className="flex min-h-10 w-full cursor-pointer select-none items-center px-3 text-sm font-medium text-text-secondary outline-none transition-colors hover:bg-surface-tertiary hover:text-text-primary data-[highlighted]:bg-surface-tertiary data-[highlighted]:text-text-primary data-[state=checked]:text-accent-text"
              >
                <Select.ItemText>{type.label}</Select.ItemText>
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
