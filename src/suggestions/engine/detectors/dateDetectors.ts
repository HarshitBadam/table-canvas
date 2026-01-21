/**
 * Date Pattern Detectors
 * 
 * Functions for detecting date patterns in data.
 */

// ============================================================================
// Date Pattern Detection
// ============================================================================

/**
 * Check if a value looks like a date.
 */
export function looksLikeDate(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value)

  const datePatterns = [
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/,  // MM/DD/YYYY or DD-MM-YYYY
    /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/,     // YYYY-MM-DD
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/,   // Month DD, YYYY
    /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/,     // DD Month YYYY
  ]

  return datePatterns.some(p => p.test(str))
}

/**
 * Detect multiple date formats in same column.
 */
export function detectDateFormats(topValues: Array<{ value: unknown }>): Set<string> {
  const formats = new Set<string>()

  for (const { value } of topValues) {
    if (value === null || value === undefined) continue
    const str = String(value).trim()
    if (!str) continue

    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
      formats.add('YYYY-MM-DD')
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
      formats.add('MM/DD/YYYY')
    } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) {
      formats.add('MM/DD/YY')
    } else if (/^\d{1,2}-[A-Za-z]{3}-\d{4}/.test(str)) {
      formats.add('DD-Mon-YYYY')
    } else if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(str)) {
      formats.add('Mon DD, YYYY')
    } else if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(str)) {
      formats.add('DD Mon YYYY')
    }
  }

  return formats
}
