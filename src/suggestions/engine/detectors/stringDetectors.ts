/**
 * String Pattern Detectors
 * 
 * Functions for detecting patterns in string data.
 */

import { isPlaceholder } from '../../cleaningConstants'

/** Result of typo detection (near-duplicate values) */
export interface TypoMatch {
  from: string
  to: string
  fromCount: number
  toCount: number
}

/** Result of placeholder detection */
export interface PlaceholderResult {
  placeholders: string[]
  totalCount: number
}

// ============================================================================
// Whitespace Detection
// ============================================================================

/**
 * Check if a value has leading or trailing whitespace.
 */
export function hasLeadingTrailingWhitespace(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value)
  return str !== str.trim()
}

// ============================================================================
// Case Detection
// ============================================================================

/**
 * Check if values have mixed casing (e.g., "Electronics" vs "electronics").
 */
export function hasMixedCase(values: Array<{ value: unknown; count?: number }>): boolean {
  const strings = values
    .map(v => String(v.value).trim())
    .filter(s => s && s.length > 0)

  const normalizedValues = new Map<string, Set<string>>()
  for (const s of strings) {
    const lower = s.toLowerCase()
    if (!normalizedValues.has(lower)) {
      normalizedValues.set(lower, new Set())
    }
    normalizedValues.get(lower)!.add(s)
  }

  return Array.from(normalizedValues.values()).some(variants => variants.size > 1)
}

/**
 * Get case variants for normalization (returns mapping of variant -> canonical).
 */
export function getMixedCaseVariants(
  values: Array<{ value: unknown; count: number }>
): Record<string, string> {
  const normalizedValues = new Map<string, Array<{ value: string; count: number }>>()

  for (const v of values) {
    if (v.value === null || v.value === undefined) continue
    const str = String(v.value).trim()
    if (!str) continue

    const lower = str.toLowerCase()
    if (!normalizedValues.has(lower)) {
      normalizedValues.set(lower, [])
    }
    normalizedValues.get(lower)!.push({ value: str, count: v.count })
  }

  const mappings: Record<string, string> = {}

  for (const [, variants] of normalizedValues) {
    if (variants.length > 1) {
      // Sort by count descending - the most common is canonical
      variants.sort((a, b) => b.count - a.count)
      const canonical = variants[0].value
      for (let i = 1; i < variants.length; i++) {
        mappings[variants[i].value] = canonical
      }
    }
  }

  return mappings
}

// ============================================================================
// Typo Detection
// ============================================================================

/**
 * Levenshtein distance for typo detection.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
    }
  }
  return matrix[b.length][a.length]
}

/**
 * Find near-duplicate values that might be typos.
 */
export function findTypos(topValues: Array<{ value: unknown; count: number }>): TypoMatch[] {
  const results: TypoMatch[] = []
  const strings = topValues
    .filter(v => v.value !== null && v.value !== undefined)
    .map(v => ({ str: String(v.value), count: v.count }))

  for (let i = 0; i < strings.length; i++) {
    for (let j = i + 1; j < strings.length; j++) {
      const a = strings[i].str.toLowerCase()
      const b = strings[j].str.toLowerCase()

      // Skip if too different in length
      if (Math.abs(a.length - b.length) > 2) continue
      // Skip short strings
      if (a.length < 3 || b.length < 3) continue

      const distance = levenshteinDistance(a, b)
      const threshold = Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.25))

      if (distance > 0 && distance <= threshold) {
        // The one with higher count is likely correct
        if (strings[i].count >= strings[j].count) {
          results.push({
            from: strings[j].str,
            to: strings[i].str,
            fromCount: strings[j].count,
            toCount: strings[i].count,
          })
        } else {
          results.push({
            from: strings[i].str,
            to: strings[j].str,
            fromCount: strings[i].count,
            toCount: strings[j].count,
          })
        }
      }
    }
  }
  return results
}

// ============================================================================
// Placeholder Detection
// ============================================================================

/**
 * Find placeholder values in topValues (e.g., "N/A", "NULL", "-").
 */
export function findPlaceholders(
  topValues: Array<{ value: unknown; count: number }>
): PlaceholderResult {
  const found: string[] = []
  let totalCount = 0

  for (const { value, count } of topValues) {
    if (isPlaceholder(value)) {
      found.push(String(value))
      totalCount += count
    }
  }

  return { placeholders: found, totalCount }
}

// ============================================================================
// Delimiter Detection
// ============================================================================

/**
 * Check if values have a consistent delimiter.
 */
export function hasConsistentDelimiter(values: Array<{ value: unknown }>): string | null {
  const delimiters = [',', '|', ';', '-', '_']

  for (const delim of delimiters) {
    const counts = values
      .map(v => (String(v.value).match(new RegExp(`\\${delim}`, 'g')) || []).length)
      .filter(c => c > 0)

    if (counts.length >= values.length * 0.7 && counts.every(c => c === counts[0])) {
      return delim
    }
  }

  return null
}

// ============================================================================
// Sequential Pattern Detection
// ============================================================================

/**
 * Check if values follow a sequential pattern like PROD001, PROD002, etc.
 */
export function hasSequentialPattern(values: string[]): boolean {
  const numericSuffixes = values.map(v => {
    const match = v.match(/(\d+)$/)
    return match ? parseInt(match[1]) : null
  }).filter((n): n is number => n !== null)

  if (numericSuffixes.length < 3) return false

  const sorted = [...numericSuffixes].sort((a, b) => a - b)
  let sequential = 0
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= 3) sequential++
  }
  return sequential >= (sorted.length - 1) * 0.7
}
