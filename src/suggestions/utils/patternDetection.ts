/**
 * Pattern Detection Utilities
 * 
 * Functions for detecting patterns in data values (typos, formats, etc.).
 */

/**
 * Calculate Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

/**
 * Calculate string similarity (0-1 scale).
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0
  
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase())
  const maxLength = Math.max(a.length, b.length)
  
  return 1 - distance / maxLength
}

/**
 * Find potential typos in a set of values.
 */
export function findTypos(
  values: Array<{ value: unknown; count: number }>,
  threshold: number = 0.85
): Array<{ original: string; suggested: string; similarity: number }> {
  const typos: Array<{ original: string; suggested: string; similarity: number }> = []
  const stringValues = values
    .filter(v => v.value !== null && v.value !== undefined)
    .map(v => ({ value: String(v.value), count: v.count }))
  
  // Sort by count (most frequent first)
  stringValues.sort((a, b) => b.count - a.count)
  
  for (let i = 0; i < stringValues.length; i++) {
    const current = stringValues[i]
    
    // Skip if this is a frequent value (likely correct)
    if (current.count > 5) continue
    
    // Compare against more frequent values
    for (let j = 0; j < i; j++) {
      const frequent = stringValues[j]
      
      // Only compare if frequent value is much more common
      if (frequent.count < current.count * 3) continue
      
      const similarity = stringSimilarity(current.value, frequent.value)
      
      if (similarity >= threshold && similarity < 1) {
        typos.push({
          original: current.value,
          suggested: frequent.value,
          similarity,
        })
        break // Only one suggestion per value
      }
    }
  }
  
  return typos
}

/**
 * Detect common date formats in values.
 */
export function detectDateFormats(
  values: Array<{ value: unknown }>
): Map<string, number> {
  const formats = new Map<string, number>()
  
  const patterns: Array<[RegExp, string]> = [
    [/^\d{4}-\d{2}-\d{2}$/, 'ISO (YYYY-MM-DD)'],
    [/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'ISO DateTime'],
    [/^\d{1,2}\/\d{1,2}\/\d{4}$/, 'US (M/D/YYYY)'],
    [/^\d{1,2}\/\d{1,2}\/\d{2}$/, 'US Short (M/D/YY)'],
    [/^\d{1,2}-\d{1,2}-\d{4}$/, 'Alt (M-D-YYYY)'],
    [/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/, 'Text (Mon D, YYYY)'],
    [/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/, 'Text (D Mon YYYY)'],
    [/^\d{4}\/\d{2}\/\d{2}$/, 'Asian (YYYY/MM/DD)'],
    [/^\d{2}\.\d{2}\.\d{4}$/, 'European (DD.MM.YYYY)'],
  ]
  
  for (const { value } of values) {
    if (value === null || value === undefined) continue
    const str = String(value).trim()
    
    for (const [pattern, name] of patterns) {
      if (pattern.test(str)) {
        formats.set(name, (formats.get(name) || 0) + 1)
        break
      }
    }
  }
  
  return formats
}

/**
 * Check if a value looks like a timestamp (Unix epoch).
 */
export function looksLikeTimestamp(value: unknown): boolean {
  if (value === null || value === undefined) return false
  
  const num = Number(value)
  if (isNaN(num)) return false
  
  // Unix timestamp in seconds (1970-2100)
  if (num >= 0 && num <= 4102444800) {
    const date = new Date(num * 1000)
    return date.getFullYear() >= 1970 && date.getFullYear() <= 2100
  }
  
  // Unix timestamp in milliseconds
  if (num >= 0 && num <= 4102444800000) {
    const date = new Date(num)
    return date.getFullYear() >= 1970 && date.getFullYear() <= 2100
  }
  
  return false
}

/**
 * Detect phone number patterns.
 */
export function looksLikePhoneNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  
  // Remove common formatting
  const cleaned = str.replace(/[\s\-().+]/g, '')
  
  // Check if it's all digits and reasonable length
  if (!/^\d{7,15}$/.test(cleaned)) return false
  
  // Common phone patterns
  const patterns = [
    /^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/, // US: 123-456-7890
    /^\+?1?\d{10}$/, // US: +11234567890
    /^\(\d{3}\)\s?\d{3}[-.\s]?\d{4}$/, // US: (123) 456-7890
    /^\+?\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/, // International
  ]
  
  return patterns.some(p => p.test(str))
}

/**
 * Detect email patterns.
 */
export function looksLikeEmail(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  
  // Basic email pattern
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)
}

/**
 * Detect URL patterns.
 */
export function looksLikeUrl(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  
  // URL patterns
  return /^(https?:\/\/|www\.)[^\s]+\.[^\s]+/.test(str)
}

/**
 * Detect currency values.
 */
export function looksLikeCurrency(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  
  // Currency patterns
  const patterns = [
    /^[$€£¥₹]\s?[\d,]+\.?\d*$/, // $1,234.56
    /^[\d,]+\.?\d*\s?[$€£¥₹]$/, // 1,234.56€
    /^\d{1,3}(,\d{3})*(\.\d{2})?$/, // 1,234.56 (could be currency)
  ]
  
  return patterns.some(p => p.test(str))
}

/**
 * Detect percentage values.
 */
export function looksLikePercentage(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  
  return /^-?\d+\.?\d*\s?%$/.test(str)
}
