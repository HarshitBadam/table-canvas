export function ColumnTypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase()
  let color = 'bg-surface-tertiary text-text-secondary'

  if (['number', 'integer', 'float', 'double', 'decimal'].includes(t)) {
    color = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  } else if (['string', 'varchar', 'text', 'char'].includes(t)) {
    color = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  } else if (['boolean', 'bool'].includes(t)) {
    color = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  } else if (['date', 'datetime', 'timestamp', 'time'].includes(t)) {
    color = 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
  } else if (t === 'enum') {
    color = 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'
  }

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>
      {type}
    </span>
  )
}
