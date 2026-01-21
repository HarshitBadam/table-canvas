/**
 * Column Classifier
 * 
 * Classifies columns for intelligent suggestion generation.
 * Determines what types of analysis/charts make sense for each column.
 */

import type { ColumnSchema, ColumnProfile, ColumnClassification } from '@/types'
import { hasSequentialPattern } from '../detectors'

// ============================================================================
// Main Classification Function
// ============================================================================

/**
 * Classify a column for intelligent suggestion generation.
 */
export function classifyColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  // 1. Check for unique identifiers first (most important to filter out)
  if (isUniqueIdentifier(col, profile, rowCount)) {
    return 'unique_identifier'
  }

  // 2. Temporal columns
  if (col.type === 'date' || col.type === 'datetime') {
    return 'temporal'
  }

  // 3. Numeric columns
  if (col.type === 'number') {
    return classifyNumericColumn(col, profile, rowCount)
  }

  // 4. String columns
  if (col.type === 'string') {
    return classifyStringColumn(col, profile, rowCount)
  }

  return 'text'
}

// ============================================================================
// Unique Identifier Detection
// ============================================================================

/**
 * Check if a column is a unique identifier (should not be analyzed/charted).
 */
export function isUniqueIdentifier(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): boolean {
  // Name-based detection patterns
  const name = col.name.toLowerCase()
  const idPatterns = [
    /^id$/,           // exactly "id"
    /_id$/,           // ends with _id
    /^uuid$/,         // uuid
    /^guid$/,         // guid
    /_key$/,          // ends with _key
    /^key$/,          // exactly "key"
    /_code$/,         // ends with _code
    /^code$/,         // exactly "code"
    /^sku$/,          // exactly "sku"
    /^serial/,        // starts with "serial"
    /^index$/,        // exactly "index"
    /^row_?num/,      // row number variations
  ]
  const hasIdName = idPatterns.some(p => p.test(name))

  // Also check if name ends with "id" and is short
  const endsWithId = name.endsWith('id') && name.length <= 15 && name.length > 2

  // Semantic hint check
  if (col.semanticHints?.includes('id')) return true

  // Profile-based detection
  if (profile) {
    // Key candidate from profiler (>95% unique, <1% null)
    if (profile.isKeyCandidate) return true

    // Uniqueness ratio > 95% with additional checks
    const uniquenessRatio = profile.distinctCount / Math.max(rowCount, 1)
    if (uniquenessRatio > 0.95) {
      // If numeric, check for sequential pattern
      if (col.type === 'number' && profile.stdDev !== undefined &&
          profile.min !== undefined && profile.max !== undefined) {
        const range = profile.max - profile.min
        if (range > 0) {
          const expectedStdDev = range / Math.sqrt(12)
          const isSequential = expectedStdDev > 0 &&
            Math.abs((profile.stdDev - expectedStdDev) / expectedStdDev) < 0.5
          if (isSequential) return true
        }

        // Check for classic auto-increment pattern
        if ((profile.min === 0 || profile.min === 1) &&
            Math.abs(profile.max - (profile.min + rowCount - 1)) <= rowCount * 0.1) {
          return true
        }
      }

      // String with high uniqueness AND ID-like name
      if ((hasIdName || endsWithId) && col.type === 'string') return true

      // Check for sequential string pattern
      if (col.type === 'string' && profile.topValues && profile.topValues.length >= 3) {
        if (hasSequentialPattern(profile.topValues.map(v => String(v.value)))) {
          return true
        }
      }
    }
  }

  // Strong name-based signals without profile
  if (hasIdName && name.length <= 12) return true
  if (endsWithId) return true

  return false
}

// ============================================================================
// Numeric Column Classification
// ============================================================================

/**
 * Classify a numeric column as continuous or discrete.
 */
export function classifyNumericColumn(
  _col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (!profile) return 'continuous_numeric'

  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1)

  // Few distinct values = discrete
  if (profile.distinctCount <= 20 || distinctRatio < 0.1) {
    return 'discrete_numeric'
  }

  return 'continuous_numeric'
}

// ============================================================================
// String Column Classification
// ============================================================================

/**
 * Classify a string column by cardinality.
 */
export function classifyStringColumn(
  _col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (!profile) return 'text'

  const distinctCount = profile.distinctCount
  const uniquenessRatio = distinctCount / Math.max(rowCount, 1)

  // Low cardinality categorical
  if (distinctCount <= 20) {
    return 'low_cardinality_cat'
  }

  // High cardinality categorical (still chartable with grouping)
  if (uniquenessRatio < 0.5) {
    return 'high_cardinality_cat'
  }

  // Free-form text
  return 'text'
}

// ============================================================================
// ID Column Check (for other modules)
// ============================================================================

/**
 * Check if a column looks like an ID column.
 * Used to filter out ID columns from certain suggestions.
 */
export function looksLikeIdColumn(
  col: ColumnSchema,
  profile?: ColumnProfile
): boolean {
  // Check semantic hints
  if (col.semanticHints?.includes('id')) return true

  // Check if values are unique or near-unique (key candidate)
  if (profile?.isKeyCandidate) return true

  // Check column name patterns
  const name = col.name.toLowerCase()
  if (name.endsWith('_id') || name.endsWith('id') ||
      name === 'id' || name.includes('code') ||
      name.includes('sku') || name.includes('product_id') ||
      name.includes('order_id') || name.includes('user_id') ||
      name.includes('customer_id') || name.includes('item_id')) return true

  // Check for sequential pattern in string values
  if (profile?.topValues && profile.topValues.length >= 3) {
    const values = profile.topValues.map(v => String(v.value))
    if (hasSequentialPattern(values)) return true
  }

  return false
}
