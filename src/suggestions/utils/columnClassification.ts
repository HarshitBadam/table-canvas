/**
 * Column Classification Utilities
 * 
 * Functions for classifying columns by their data characteristics.
 */

import type { ColumnSchema, ColumnProfile, ColumnClassification } from '@/lib/types'

/**
 * Check if a column looks like an ID column.
 */
export function isUniqueIdentifier(col: ColumnSchema, profile?: ColumnProfile): boolean {
  // Check semantic hints
  if (col.semanticHints?.includes('id')) return true
  
  // Check if values are unique (key candidate)
  if (profile?.isKeyCandidate) return true
  
  // Check column name patterns
  const nameLower = col.name.toLowerCase()
  const idPatterns = [
    'id', '_id', 'uuid', 'guid', 'key', 
    'code', 'sku', 'ean', 'upc', 'isbn',
    'ref', 'reference', 'serial', 'number'
  ]
  
  if (idPatterns.some(p => nameLower === p || nameLower.endsWith(p) || nameLower.endsWith('_' + p))) {
    return true
  }
  
  return false
}

/**
 * Check if a column is numeric and meaningful for analysis.
 */
export function isAnalyzableNumeric(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'number') return false
  if (!profile) return true
  
  // Skip if it looks like an ID
  if (isUniqueIdentifier(col, profile)) return false
  
  // Must have some variance
  if (profile.stdDev !== undefined && profile.stdDev === 0) return false
  
  return true
}

/**
 * Check if a string column is good for grouping.
 */
export function isGroupableCategory(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'string') return false
  if (!profile) return true
  
  // Skip if it looks like an ID
  if (isUniqueIdentifier(col, profile)) return false
  
  // Must have reasonable cardinality
  const distinctCount = profile.distinctCount ?? 0
  if (distinctCount > 100) return false
  if (distinctCount < 2) return false
  
  return true
}

/**
 * Check if a column appears to be a measure (aggregatable numeric).
 */
export function isMeasureColumn(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'number') return false
  
  // Check semantic hints - currency and percentage are common measure types
  if (col.semanticHints?.includes('currency') || col.semanticHints?.includes('percentage')) {
    return true
  }
  
  // Check column name for common measure patterns
  const nameLower = col.name.toLowerCase()
  const measurePatterns = [
    'amount', 'total', 'sum', 'count', 'quantity', 'qty',
    'price', 'cost', 'value', 'revenue', 'sales', 'profit',
    'rate', 'score', 'points', 'weight', 'height', 'width',
  ]
  
  if (measurePatterns.some(p => nameLower.includes(p))) {
    return true
  }
  
  return isAnalyzableNumeric(col, profile)
}

/**
 * Check if a column appears to be a dimension (grouping category).
 */
export function isDimensionColumn(col: ColumnSchema, profile?: ColumnProfile): boolean {
  // Dates are always dimensions
  if (col.type === 'date' || col.type === 'datetime') return true
  
  // Booleans are dimensions
  if (col.type === 'boolean') return true
  
  // Check for groupable strings
  if (col.type === 'string') {
    return isGroupableCategory(col, profile)
  }
  
  // Check for discrete numerics
  if (col.type === 'number' && profile) {
    if (profile.distinctCount && profile.distinctCount <= 20) {
      return true
    }
  }
  
  return false
}

/**
 * Classify a numeric column as continuous or discrete.
 */
export function classifyNumericColumn(
  _col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): 'continuous_numeric' | 'discrete_numeric' {
  if (!profile) return 'continuous_numeric'
  
  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1)
  
  // Few distinct values = discrete
  if (profile.distinctCount <= 10 || distinctRatio < 0.05) {
    return 'discrete_numeric'
  }
  
  // Zero variance = all same value
  if (profile.stdDev !== undefined && profile.stdDev === 0) {
    return 'discrete_numeric'
  }
  
  // Integer values with small range might be discrete
  if (profile.min !== undefined && profile.max !== undefined) {
    const range = profile.max - profile.min
    if (range <= 20 && profile.distinctCount <= range + 1) {
      return 'discrete_numeric'
    }
  }
  
  return 'continuous_numeric'
}

/**
 * Classify a string column by cardinality.
 */
export function classifyStringColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): 'low_cardinality_cat' | 'high_cardinality_cat' | 'text' {
  if (!profile) return 'low_cardinality_cat'
  
  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1)
  
  // Check for semantic hints
  if (col.semanticHints?.includes('category')) {
    return profile.distinctCount <= 20 ? 'low_cardinality_cat' : 'high_cardinality_cat'
  }
  
  // Very low cardinality
  if (profile.distinctCount <= 20 && distinctRatio < 0.5) {
    return 'low_cardinality_cat'
  }
  
  // Medium cardinality
  if (distinctRatio < 0.95 && profile.distinctCount <= 100) {
    return 'high_cardinality_cat'
  }
  
  return 'text'
}

/**
 * Classify a column for chart/analysis purposes.
 */
export function classifyColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (col.type === 'number') {
    return classifyNumericColumn(col, profile, rowCount)
  }
  
  if (col.type === 'date' || col.type === 'datetime') {
    return 'temporal'
  }
  
  if (col.type === 'boolean') {
    return 'boolean'
  }
  
  return classifyStringColumn(col, profile, rowCount)
}

/**
 * Get the best chart type for a column classification.
 */
export function getRecommendedChartType(
  classification: ColumnClassification
): 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' {
  switch (classification) {
    case 'low_cardinality_cat':
      return 'pie'
    case 'high_cardinality_cat':
      return 'bar'
    case 'continuous_numeric':
      return 'histogram'
    case 'discrete_numeric':
      return 'bar'
    case 'temporal':
      return 'line'
    case 'boolean':
      return 'pie'
    case 'text':
      return 'bar'
    default:
      return 'bar'
  }
}
