/** Common sentinel values that indicate missing or placeholder data. */
export const PLACEHOLDER_VALUES = [
  'n/a', 'na', 'n.a.', 'null', 'none', 'nil', '--', '---',
  'unknown', 'tbd', 'to be determined', 'not available', 'not applicable',
  'missing', '#n/a', '#null', '?', 'undefined'
] as const

/** Case-insensitive, trimmed check for placeholder values. */
export function isPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const normalized = String(value).toLowerCase().trim()
  return (PLACEHOLDER_VALUES as readonly string[]).includes(normalized)
}

