export function ColumnTypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase()
  let color = 'bg-surface-tertiary text-text-secondary'

  if (['number', 'integer', 'float', 'double', 'decimal'].includes(t)) {
    color = 'type-badge-number'
  } else if (['string', 'varchar', 'text', 'char'].includes(t)) {
    color = 'type-badge-string'
  } else if (['boolean', 'bool'].includes(t)) {
    color = 'type-badge-boolean'
  } else if (['date', 'datetime', 'timestamp', 'time'].includes(t)) {
    color = 'type-badge-temporal'
  } else if (t === 'enum') {
    color = 'type-badge-enum'
  }

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>
      {type}
    </span>
  )
}
