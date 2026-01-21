/**
 * Cleaning Constants
 * Single source of truth for placeholder values and cleaning utilities
 */

import type { CellValue } from '@/lib/types'

/**
 * Placeholder/sentinel values that should be converted to NULL
 * These are common values that indicate missing or placeholder data
 */
export const PLACEHOLDER_VALUES = [
  'n/a', 'na', 'n.a.', 'null', 'none', 'nil', '--', '---',
  'unknown', 'tbd', 'to be determined', 'not available', 'not applicable',
  'missing', '#n/a', '#null', '?', 'undefined'
] as const

export type PlaceholderValue = typeof PLACEHOLDER_VALUES[number]

/**
 * Check if a value is a placeholder that should be converted to NULL
 * Handles case-insensitivity and trimming
 */
export function isPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const normalized = String(value).toLowerCase().trim()
  return (PLACEHOLDER_VALUES as readonly string[]).includes(normalized)
}

/**
 * Find all placeholder values in a column across all rows
 * Returns array of { rowId, value } for each placeholder found
 */
export function findAllPlaceholdersInColumn(
  rows: Array<Record<string, unknown>>,
  columnId: string
): Array<{ rowId: string; value: unknown }> {
  const results: Array<{ rowId: string; value: unknown }> = []
  
  for (const row of rows) {
    const value = row[columnId]
    if (isPlaceholder(value)) {
      results.push({
        rowId: row.__rowId as string,
        value,
      })
    }
  }
  
  return results
}

/**
 * Count unique placeholder types found in a column
 * Returns a map of normalized placeholder -> count
 */
export function countPlaceholderTypes(
  rows: Array<Record<string, unknown>>,
  columnId: string
): Map<string, number> {
  const counts = new Map<string, number>()
  
  for (const row of rows) {
    const value = row[columnId]
    if (isPlaceholder(value)) {
      const normalized = String(value).toLowerCase().trim()
      counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
  }
  
  return counts
}

/**
 * Get display-friendly list of placeholder types found
 * Returns array of original values (preserving case) for display
 */
export function getPlaceholderDisplayValues(
  rows: Array<Record<string, unknown>>,
  columnId: string
): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  
  for (const row of rows) {
    const value = row[columnId]
    if (isPlaceholder(value)) {
      const normalized = String(value).toLowerCase().trim()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        results.push(String(value))
      }
    }
  }
  
  return results
}

/**
 * Apply placeholder-to-null conversion to a single value
 */
export function convertPlaceholderToNull(value: CellValue): CellValue {
  if (isPlaceholder(value)) {
    return null
  }
  return value
}
