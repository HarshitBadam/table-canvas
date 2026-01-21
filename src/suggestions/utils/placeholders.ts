/**
 * Placeholder Value Detection
 * 
 * Functions for detecting placeholder/missing value indicators.
 */

/**
 * Common placeholder values that indicate missing data.
 */
export const PLACEHOLDER_VALUES = new Set([
  // Text placeholders
  'n/a', 'na', 'n.a.', 'n.a',
  'null', 'nil', 'none', 'undefined',
  'unknown', 'unk', 'missing', 'blank',
  'not available', 'not applicable', 'not specified',
  'tbd', 'tba', 'tbh', 'to be determined',
  'pending', 'awaiting', 'processing',
  'empty', '(empty)', '[empty]',
  '-', '--', '---', '...',
  'x', 'xx', 'xxx',
  '?', '??', '???',
  
  // Numeric placeholders
  '0', '00', '000',
  '-1', '999', '9999', '99999',
  '-999', '-9999', '-99999',
  
  // Date placeholders
  '1/1/1900', '01/01/1900', '1900-01-01',
  '1/1/1970', '01/01/1970', '1970-01-01',
  '12/31/9999', '9999-12-31',
])

/**
 * Check if a value appears to be a placeholder.
 */
export function isPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (value === '') return true
  
  const str = String(value).toLowerCase().trim()
  
  // Check against known placeholders
  if (PLACEHOLDER_VALUES.has(str)) return true
  
  // Check for common patterns
  if (/^[-\s.]+$/.test(str)) return true // Only dashes, spaces, dots
  if (/^\?+$/.test(str)) return true // Only question marks
  if (/^x+$/i.test(str)) return true // Only x's
  if (/^\d{1,2}\/\d{1,2}\/1900$/.test(str)) return true // Excel epoch dates
  
  return false
}

/**
 * Find placeholder values in a dataset.
 */
export function findPlaceholders(
  values: Array<{ value: unknown; count: number }>
): Array<{ value: string; count: number; type: string }> {
  const placeholders: Array<{ value: string; count: number; type: string }> = []
  
  for (const { value, count } of values) {
    if (value === null || value === undefined) {
      placeholders.push({ value: '(null)', count, type: 'null' })
      continue
    }
    
    const str = String(value)
    
    if (str === '') {
      placeholders.push({ value: '(empty string)', count, type: 'empty' })
      continue
    }
    
    const strLower = str.toLowerCase().trim()
    
    if (PLACEHOLDER_VALUES.has(strLower)) {
      let type = 'text'
      if (['null', 'nil', 'none', 'undefined'].includes(strLower)) type = 'null-like'
      else if (['n/a', 'na', 'n.a.', 'not available', 'not applicable'].includes(strLower)) type = 'not-applicable'
      else if (['missing', 'blank', 'unknown', 'unk'].includes(strLower)) type = 'missing-indicator'
      else if (['tbd', 'tba', 'pending'].includes(strLower)) type = 'pending'
      else if (/^[-.?x]+$/i.test(strLower)) type = 'symbol'
      
      placeholders.push({ value: str, count, type })
    }
  }
  
  return placeholders
}

/**
 * Calculate percentage of placeholder values.
 */
export function calculatePlaceholderRate(
  values: Array<{ value: unknown; count: number }>
): { rate: number; totalPlaceholders: number; total: number } {
  let totalPlaceholders = 0
  let total = 0
  
  for (const { value, count } of values) {
    total += count
    if (isPlaceholder(value)) {
      totalPlaceholders += count
    }
  }
  
  return {
    rate: total > 0 ? totalPlaceholders / total : 0,
    totalPlaceholders,
    total,
  }
}

/**
 * Suggest replacement strategy for placeholders.
 */
export function suggestPlaceholderReplacement(
  columnType: string,
  placeholderType: string
): { strategy: string; value: unknown } {
  // Null-like values → actual null
  if (placeholderType === 'null-like' || placeholderType === 'null') {
    return { strategy: 'convert_to_null', value: null }
  }
  
  // Pending/TBD → keep as placeholder text
  if (placeholderType === 'pending') {
    return { strategy: 'keep', value: undefined }
  }
  
  // Based on column type
  switch (columnType) {
    case 'number':
      return { strategy: 'convert_to_null', value: null }
    case 'date':
    case 'datetime':
      return { strategy: 'convert_to_null', value: null }
    case 'boolean':
      return { strategy: 'convert_to_null', value: null }
    case 'string':
      return { strategy: 'convert_to_empty', value: '' }
    default:
      return { strategy: 'convert_to_null', value: null }
  }
}

/**
 * Check if a numeric value is likely a placeholder.
 */
export function isNumericPlaceholder(value: number): boolean {
  const placeholderNumbers = new Set([
    -1, -999, -9999, -99999,
    0,
    999, 9999, 99999, 999999,
    -1.0, 0.0,
  ])
  
  return placeholderNumbers.has(value)
}

/**
 * Check if a date is likely a placeholder.
 */
export function isDatePlaceholder(value: Date | number | string): boolean {
  let date: Date
  
  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'number') {
    date = new Date(value)
  } else {
    date = new Date(value)
  }
  
  if (isNaN(date.getTime())) return true
  
  // Common placeholder dates
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  
  // Excel epoch (1900-01-01)
  if (year === 1900 && month === 0 && day === 1) return true
  
  // Unix epoch (1970-01-01)
  if (year === 1970 && month === 0 && day === 1) return true
  
  // Far future (9999-12-31)
  if (year === 9999 && month === 11 && day === 31) return true
  
  // Very old dates (before 1900)
  if (year < 1900) return true
  
  // Very future dates (after 2100)
  if (year > 2100) return true
  
  return false
}
