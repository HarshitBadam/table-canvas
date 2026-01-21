/**
 * Suggestion Rule Helpers
 * 
 * Shared utilities for suggestion rule evaluation and building.
 */

import type { ColumnSchema, ColumnProfile, ColumnClassification } from '@/lib/types'
import type { SuggestionEngineContext } from '../engine/types'
import { generateTableVersionHash } from '../suggestionsStore'

/**
 * Create a deterministic suggestion ID.
 */
export function createSuggestionId(
  ruleId: string,
  tableId: string,
  columnId?: string,
  extra?: string
): string {
  const parts = [ruleId, tableId]
  if (columnId) parts.push(columnId)
  if (extra) parts.push(extra)
  return parts.join(':')
}

/**
 * Get version hash for a context.
 */
export function getVersionHash(ctx: SuggestionEngineContext): string {
  return ctx.tableVersionHash ?? generateTableVersionHash(
    ctx.tableId,
    ctx.profile?.rowCount ?? 0,
    ctx.schema.columns.length,
    undefined
  )
}

/**
 * Check if a column looks like an ID column.
 */
export function looksLikeIdColumn(col: ColumnSchema, profile?: ColumnProfile): boolean {
  // Check semantic hints
  if (col.semanticHints?.includes('id')) return true
  
  // Check if values are unique or near-unique (key candidate)
  if (profile?.isKeyCandidate) return true
  
  // Check column name patterns
  const nameLower = col.name.toLowerCase()
  const idPatterns = ['id', '_id', 'uuid', 'guid', 'key', 'code', 'sku', 'ean', 'upc', 'isbn']
  if (idPatterns.some(p => nameLower === p || nameLower.endsWith(p))) return true
  
  return false
}

/**
 * Check if a value looks like a number (even if stored as string).
 */
export function looksLikeNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).replace(/[,$%\s]/g, '')
  return !isNaN(Number(str)) && str.length > 0
}

/**
 * Check if a numeric column is meaningful for analysis.
 */
export function isAnalyzableNumeric(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'number') return false
  if (!profile) return true
  
  // Skip if it looks like an ID
  if (profile.isKeyCandidate) return false
  if (col.semanticHints?.includes('id')) return false
  
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
  if (profile.isKeyCandidate) return false
  if (col.semanticHints?.includes('id')) return false
  
  // Must have reasonable cardinality
  const distinctCount = profile.distinctCount ?? 0
  if (distinctCount > 100) return false
  if (distinctCount < 2) return false
  
  return true
}

/**
 * Classify a numeric column as continuous or discrete.
 */
export function classifyNumericColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
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
): ColumnClassification {
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
 * Check if a derived table with similar transform already exists.
 */
export function hasSimilarDerivedTable(
  ctx: SuggestionEngineContext,
  transformType: string,
  groupByColumns?: string[]
): boolean {
  if (!ctx.existingDerivedTables) return false
  
  return ctx.existingDerivedTables.some(dt => {
    if (dt.transformType !== transformType) return false
    
    if (groupByColumns && dt.groupByColumns) {
      const same = groupByColumns.length === dt.groupByColumns.length &&
        groupByColumns.every(c => dt.groupByColumns!.includes(c))
      return same
    }
    
    return true
  })
}
