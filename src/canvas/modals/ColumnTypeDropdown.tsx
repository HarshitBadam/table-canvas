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
    <select
      value={value}
      onChange={event => onChange(event.target.value as ColumnType)}
      aria-label={ariaLabel}
      className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-text-secondary outline-none transition-colors hover:border-text-tertiary focus-visible:border-accent-green focus-visible:ring-2 focus-visible:ring-accent-green/20"
    >
      {COLUMN_TYPES.map(type => (
        <option key={type.value} value={type.value}>{type.label}</option>
      ))}
    </select>
  )
}
