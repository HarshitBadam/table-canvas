/**
 * Numeric Pattern Detectors
 * 
 * Functions for detecting patterns in numeric data.
 */

/** Result of outlier detection using IQR method */
export interface OutlierResult {
  hasOutliers: boolean
  lowerBound: number
  upperBound: number
}

// ============================================================================
// Number Detection
// ============================================================================

/**
 * Check if a value looks like a number (even as a string).
 */
export function looksLikeNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).replace(/[,$%\s]/g, '')
  return !isNaN(Number(str)) && str.length > 0
}

// ============================================================================
// Timestamp Detection
// ============================================================================

/**
 * Check if numeric values look like Unix timestamps.
 */
export function looksLikeTimestamp(
  min: number | undefined,
  max: number | undefined
): 'milliseconds' | 'seconds' | null {
  if (min === undefined || max === undefined) return null

  // Epoch milliseconds range: 2000-01-01 to 2100-01-01
  const epochMsMin = 946684800000
  const epochMsMax = 4102444800000

  // Epoch seconds range
  const epochSecMin = 946684800
  const epochSecMax = 4102444800

  if (min > epochMsMin && max < epochMsMax) {
    return 'milliseconds'
  }
  if (min > epochSecMin && max < epochSecMax && max < epochMsMin) {
    return 'seconds'
  }

  return null
}

// ============================================================================
// Outlier Detection
// ============================================================================

/**
 * Detect outliers using IQR method.
 */
export function detectOutliers(profile: {
  min?: number
  max?: number
  q1?: number
  q3?: number
  iqr?: number
}): OutlierResult | null {
  const { min, max, q1, q3, iqr } = profile
  if (q1 === undefined || q3 === undefined || iqr === undefined || iqr === 0) {
    return null
  }

  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr

  const hasOutliers = (min !== undefined && min < lowerBound) ||
    (max !== undefined && max > upperBound)

  return { hasOutliers, lowerBound, upperBound }
}
