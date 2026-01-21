/**
 * Suggestion Engine
 * Generates deterministic suggestions based on table metadata and profiling
 * Uses a rule-based system with confidence scoring
 */

import type { 
  Suggestion, 
  SuggestionCategory,
  SuggestionScope,
  TableSchema, 
  ColumnSchema,
  ColumnProfile,
  TransformDef,
  ColumnClassification,
} from '@/lib/types'
// generateId no longer needed - all suggestions use deterministic IDs via createSuggestionId
import { generateTableVersionHash } from './suggestionsStore'
import { PLACEHOLDER_VALUES, isPlaceholder } from './cleaningConstants'

// Generate a deterministic suggestion ID based on rule and context
// This ensures the same suggestion always has the same ID across regenerations
function createSuggestionId(ruleId: string, tableId: string, columnId?: string, extra?: string): string {
  const parts = [ruleId, tableId]
  if (columnId) parts.push(columnId)
  if (extra) parts.push(extra)
  return parts.join(':')
}

// ============================================================================
// Types
// ============================================================================

export interface SuggestionEngineContext {
  tableId: string
  tableName: string
  schema: TableSchema
  profile?: {
    columns: ColumnProfile[]
    rowCount: number
  }
  selectedColumnId?: string
  tableVersionHash?: string
  // Existing derived tables from this source - used to avoid suggesting already-created transforms
  existingDerivedTables?: Array<{
    id: string
    name: string
    transformType: string
    groupByColumns?: string[]
  }>
}

interface MetadataBundle {
  schema: TableSchema
  profile?: {
    columns: ColumnProfile[]
    rowCount: number
  }
  column?: ColumnSchema
  columnProfile?: ColumnProfile
}

// Rule interface for suggestion generation
interface SuggestionRule {
  id: string
  category: SuggestionCategory
  scope: SuggestionScope
  when: (ctx: SuggestionEngineContext, meta: MetadataBundle) => boolean
  build: (ctx: SuggestionEngineContext, meta: MetadataBundle) => Suggestion
  score: (ctx: SuggestionEngineContext, meta: MetadataBundle) => number
}

// ============================================================================
// Rule Registry
// ============================================================================

const suggestionRules: SuggestionRule[] = []

function registerRule(rule: SuggestionRule): void {
  suggestionRules.push(rule)
}

// ============================================================================
// Helper Functions
// ============================================================================

// Confidence is computed from score during suggestion build
// High: score >= 80, Medium: 50-79, Low: < 50

function getVersionHash(ctx: SuggestionEngineContext): string {
  return ctx.tableVersionHash ?? generateTableVersionHash(
    ctx.tableId,
    ctx.profile?.rowCount ?? 0,
    ctx.schema.columns.length,
    undefined
  )
}

function hasLeadingTrailingWhitespace(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value)
  return str !== str.trim()
}

function looksLikeNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).replace(/[,$%\s]/g, '')
  return !isNaN(Number(str)) && str.length > 0
}

/**
 * Check if a column looks like an ID column (should not have typo detection applied)
 */
function looksLikeIdColumn(col: ColumnSchema, profile?: ColumnProfile): boolean {
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
  
  // Check for sequential numeric pattern in string values
  if (profile?.topValues && profile.topValues.length >= 3) {
    const values = profile.topValues.map(v => String(v.value))
    if (hasSequentialPattern(values)) return true
  }
  
  return false
}

/**
 * Check if values follow a sequential pattern like PROD001, PROD002, etc.
 */
function hasSequentialPattern(values: string[]): boolean {
  // Check if values follow pattern like PROD001, PROD002, etc.
  const numericSuffixes = values.map(v => {
    const match = v.match(/(\d+)$/)
    return match ? parseInt(match[1]) : null
  }).filter((n): n is number => n !== null)
  
  if (numericSuffixes.length < 3) return false
  
  // Check if they're roughly sequential (allow small gaps)
  const sorted = [...numericSuffixes].sort((a, b) => a - b)
  let sequential = 0
  for (let i = 1; i < sorted.length; i++) {
    // Consider sequential if difference is small (1-3)
    if (sorted[i] - sorted[i-1] <= 3) sequential++
  }
  // At least 70% of pairs should be sequential
  return sequential >= (sorted.length - 1) * 0.7
}

function hasMixedCase(values: Array<{ value: unknown; count?: number }>): boolean {
  const strings = values
    .map(v => String(v.value).trim())
    .filter(s => s && s.length > 0)
  
  // Check if the same value appears with different casing
  // e.g., "electronics" vs "Electronics" vs "ELECTRONICS"
  const normalizedValues = new Map<string, Set<string>>()
  for (const s of strings) {
    const lower = s.toLowerCase()
    if (!normalizedValues.has(lower)) {
      normalizedValues.set(lower, new Set())
    }
    normalizedValues.get(lower)!.add(s)
  }
  
  // Return true if any value has multiple case variants
  return Array.from(normalizedValues.values()).some(variants => variants.size > 1)
}

function looksLikeDate(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value)
  
  // Check common date patterns
  const datePatterns = [
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,  // MM/DD/YYYY or DD-MM-YYYY
    /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/,     // YYYY-MM-DD
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/,   // Month DD, YYYY
    /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/,     // DD Month YYYY
  ]
  
  return datePatterns.some(p => p.test(str))
}

function hasConsistentDelimiter(values: Array<{ value: unknown }>): string | null {
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

// Levenshtein distance for typo detection
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i-1] === a[j-1]
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1)
    }
  }
  return matrix[b.length][a.length]
}

// Find near-duplicate values that might be typos
interface TypoMatch {
  from: string
  to: string
  fromCount: number
  toCount: number
}

function findTypos(topValues: Array<{ value: unknown; count: number }>): TypoMatch[] {
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

// Find placeholder values in topValues (for quick detection)
// Uses shared isPlaceholder function from cleaningConstants
function findPlaceholders(topValues: Array<{ value: unknown; count: number }>): { placeholders: string[]; totalCount: number } {
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

// Detect multiple date formats in same column
function detectDateFormats(topValues: Array<{ value: unknown }>): Set<string> {
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

// Check if numeric column looks like timestamps
function looksLikeTimestamp(min: number | undefined, max: number | undefined): 'milliseconds' | 'seconds' | null {
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

// Check for outliers using IQR method
function detectOutliers(profile: { min?: number; max?: number; q1?: number; q3?: number; iqr?: number }): { hasOutliers: boolean; lowerBound: number; upperBound: number } | null {
  const { min, max, q1, q3, iqr } = profile
  if (q1 === undefined || q3 === undefined || iqr === undefined || iqr === 0) {
    return null
  }
  
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr
  
  const hasOutliers = (min !== undefined && min < lowerBound) || (max !== undefined && max > upperBound)
  
  return { hasOutliers, lowerBound, upperBound }
}

// Get case variants for normalization (returns mapping of variant -> canonical)
function getMixedCaseVariants(values: Array<{ value: unknown; count: number }>): Record<string, string> {
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
// Column Classification System
// ============================================================================

/**
 * Classify a column for intelligent suggestion generation.
 * This determines what types of analysis/charts make sense for the column.
 */
function classifyColumn(
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

/**
 * Check if a column is a unique identifier (should not be analyzed/charted)
 */
function isUniqueIdentifier(
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
  
  // Also check if name ends with "id" and is short (e.g., "userid", "productid")
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
      if (col.type === 'number' && profile.stdDev !== undefined && profile.min !== undefined && profile.max !== undefined) {
        const range = profile.max - profile.min
        if (range > 0) {
          // For a uniform/sequential distribution, stdDev ≈ range / sqrt(12)
          const expectedStdDev = range / Math.sqrt(12)
          // Allow 50% tolerance for "close to sequential"
          const isSequential = expectedStdDev > 0 && 
            Math.abs((profile.stdDev - expectedStdDev) / expectedStdDev) < 0.5
          if (isSequential) return true
        }
        
        // Check if min starts at 0 or 1 and max = rowCount (classic auto-increment)
        if ((profile.min === 0 || profile.min === 1) && 
            Math.abs(profile.max - (profile.min + rowCount - 1)) <= rowCount * 0.1) {
          return true
        }
      }
      
      // String with high uniqueness AND ID-like name
      if ((hasIdName || endsWithId) && col.type === 'string') return true
      
      // Check for sequential string pattern (PROD001, PROD002...)
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

/**
 * Classify a numeric column as continuous or discrete
 */
function classifyNumericColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (!profile) return 'continuous_numeric' // Default assumption
  
  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1)
  
  // Few distinct values = discrete (ratings 1-5, counts, boolean-like, etc.)
  if (profile.distinctCount <= 10 || distinctRatio < 0.05) {
    return 'discrete_numeric'
  }
  
  // Zero variance = all same value, treat as discrete
  if (profile.stdDev !== undefined && profile.stdDev === 0) {
    return 'discrete_numeric'
  }
  
  // Integer values with small range might be discrete
  if (profile.min !== undefined && profile.max !== undefined) {
    const range = profile.max - profile.min
    // If range is small and all values are likely integers
    if (range <= 20 && profile.distinctCount <= range + 1) {
      return 'discrete_numeric'
    }
  }
  
  return 'continuous_numeric'
}

/**
 * Classify a string column by cardinality
 */
function classifyStringColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (!profile) return 'low_cardinality_cat' // Conservative default
  
  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1)
  
  // Check for semantic hints that indicate category
  if (col.semanticHints?.includes('category')) {
    return profile.distinctCount <= 20 ? 'low_cardinality_cat' : 'high_cardinality_cat'
  }
  
  // Very low cardinality = great for pie/bar charts
  if (profile.distinctCount <= 20 && distinctRatio < 0.5) {
    return 'low_cardinality_cat'
  }
  
  // Medium cardinality = can chart but needs Top N treatment
  if (distinctRatio < 0.95 && profile.distinctCount <= 100) {
    return 'high_cardinality_cat'
  }
  
  // High uniqueness strings are likely free-form text (names, descriptions, etc.)
  return 'text'
}

// ============================================================================
// Smart Data-Driven Detection Functions
// ============================================================================

/**
 * Check if a numeric column is meaningful for analysis (not an ID, has variance)
 */
function isAnalyzableNumeric(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'number') return false
  if (!profile) return true // Assume analyzable without profile
  
  // Skip if it looks like an ID
  if (profile.isKeyCandidate) return false
  if (col.semanticHints?.includes('id')) return false
  
  // Must have some variance
  if (profile.stdDev !== undefined && profile.stdDev === 0) return false
  
  return true
}

/**
 * Check if a string column is good for grouping (categorical with reasonable cardinality)
 */
function isGroupableCategory(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'string') return false
  if (!profile) return true // Assume groupable without profile
  
  // Skip if it looks like an ID
  if (profile.isKeyCandidate) return false
  if (col.semanticHints?.includes('id')) return false
  
  // Must have reasonable cardinality (not too high)
  const distinctCount = profile.distinctCount ?? 0
  if (distinctCount > 100) return false // Too many categories
  if (distinctCount < 2) return false // Not enough categories
  
  return true
}

/**
 * Detect aggregation opportunities: numeric + category columns
 */
interface AggregationOpportunity {
  valueColumn: ColumnSchema
  valueProfile?: ColumnProfile
  groupColumns: Array<{ column: ColumnSchema; profile?: ColumnProfile }>
}

function detectAggregationOpportunities(
  schema: TableSchema,
  profiles?: ColumnProfile[]
): AggregationOpportunity[] {
  const opportunities: AggregationOpportunity[] = []
  
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id)
    return isAnalyzableNumeric(c, profile)
  })
  
  const categoryCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id)
    return isGroupableCategory(c, profile)
  })
  
  for (const numCol of numericCols) {
    const numProfile = profiles?.find(p => p.columnId === numCol.id)
    if (categoryCols.length > 0) {
      opportunities.push({
        valueColumn: numCol,
        valueProfile: numProfile,
        groupColumns: categoryCols.map(c => ({
          column: c,
          profile: profiles?.find(p => p.columnId === c.id)
        }))
      })
    }
  }
  
  return opportunities
}

/**
 * Detect time series analysis opportunities: date + numeric columns
 */
interface TimeSeriesOpportunity {
  dateColumn: ColumnSchema
  valueColumn: ColumnSchema
  suggestedPeriod: 'day' | 'week' | 'month' | 'quarter' | 'year'
}

function detectTimeSeriesOpportunities(
  schema: TableSchema,
  profiles?: ColumnProfile[],
  rowCount?: number
): TimeSeriesOpportunity[] {
  const opportunities: TimeSeriesOpportunity[] = []
  
  const dateCols = schema.columns.filter(c => c.type === 'date' || c.type === 'datetime')
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id)
    return isAnalyzableNumeric(c, profile)
  })
  
  for (const dateCol of dateCols) {
    const dateProfile = profiles?.find(p => p.columnId === dateCol.id)
    
    let suggestedPeriod: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'
    if (dateProfile?.min && dateProfile?.max && rowCount) {
      const spanDays = (dateProfile.max - dateProfile.min) / (1000 * 60 * 60 * 24)
      const avgGap = spanDays / Math.max(rowCount - 1, 1)
      
      if (avgGap < 2) suggestedPeriod = 'day'
      else if (avgGap < 10) suggestedPeriod = 'week'
      else if (avgGap < 45) suggestedPeriod = 'month'
      else if (avgGap < 120) suggestedPeriod = 'quarter'
      else suggestedPeriod = 'year'
    }
    
    for (const numCol of numericCols) {
      opportunities.push({ dateColumn: dateCol, valueColumn: numCol, suggestedPeriod })
    }
  }
  
  return opportunities
}

/**
 * Detect comparison opportunities: two or more numeric columns
 */
interface ComparisonOpportunity {
  column1: ColumnSchema
  column2: ColumnSchema
  similarity: number
}

function detectComparisonOpportunities(
  schema: TableSchema,
  profiles?: ColumnProfile[]
): ComparisonOpportunity[] {
  const opportunities: ComparisonOpportunity[] = []
  
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id)
    return isAnalyzableNumeric(c, profile)
  })
  
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const col1 = numericCols[i]
      const col2 = numericCols[j]
      const profile1 = profiles?.find(p => p.columnId === col1.id)
      const profile2 = profiles?.find(p => p.columnId === col2.id)
      
      let similarity = 0.5
      if (profile1?.min !== undefined && profile1?.max !== undefined &&
          profile2?.min !== undefined && profile2?.max !== undefined) {
        const range1 = Math.abs(profile1.max - profile1.min) || 1
        const range2 = Math.abs(profile2.max - profile2.min) || 1
        const rangeRatio = Math.min(range1, range2) / Math.max(range1, range2)
        
        const mean1 = profile1.mean ?? (profile1.min + profile1.max) / 2
        const mean2 = profile2.mean ?? (profile2.min + profile2.max) / 2
        const meanRatio = Math.min(Math.abs(mean1), Math.abs(mean2)) / 
                         Math.max(Math.abs(mean1), Math.abs(mean2), 1)
        
        similarity = (rangeRatio + meanRatio) / 2
      }
      
      opportunities.push({ column1: col1, column2: col2, similarity })
    }
  }
  
  return opportunities.sort((a, b) => b.similarity - a.similarity)
}

// ============================================================================
// Cleaning Rules (Column-scoped)
// ============================================================================

// Rule: Trim whitespace
registerRule({
  id: 'trim_whitespace',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    return meta.columnProfile.topValues.some(v => hasLeadingTrailingWhitespace(v.value))
  },
  build: (ctx, meta) => ({
    id: createSuggestionId('trim_whitespace', ctx.tableId, meta.column?.id),
    category: 'cleaning',
    scope: 'column',
    title: `Trim whitespace in "${meta.column!.name}"`,
    description: `Remove leading/trailing spaces that may cause matching issues.`,
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
      cleaningOperation: { type: 'trim' },
    },
    why: [
      'Detected leading or trailing spaces in values',
      'Whitespace can cause join mismatches',
      'May affect grouping and filtering',
    ],
    impact: {
      kind: 'derivedTable',
      summary: `Creates cleaned copy with trimmed values`,
    },
    action: {
      kind: 'applyPatch',
      ops: [],
      target: 'cleanCopy',
    },
  }),
  score: (_ctx, _meta) => 85,
})

// Rule: Normalize casing
registerRule({
  id: 'normalize_casing',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    // Skip ID-like columns
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false
    
    // Apply to any low-cardinality string column (< 30 distinct values)
    if ((meta.columnProfile.distinctCount ?? 100) > 30) return false
    
    return hasMixedCase(meta.columnProfile.topValues)
  },
  build: (ctx, meta) => {
    const mappings = getMixedCaseVariants(meta.columnProfile!.topValues!)
    const variants = Object.keys(mappings)
    
    return {
      id: createSuggestionId('normalize_case', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Normalize casing in "${meta.column!.name}"`,
      description: `Found ${variants.length} case variant(s): ${variants.slice(0, 3).map(v => `"${v}"`).join(', ')}${variants.length > 3 ? '...' : ''}`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'normalize_case', mappings },
      },
      why: [
        'Detected inconsistent casing across values',
        'This column appears to be categorical',
        'Consistent casing improves grouping accuracy',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Normalizes ${variants.length} case variant(s) to canonical form`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    }
  },
  score: (_ctx, meta) => {
    const distinctCount = meta.columnProfile?.distinctCount ?? 100
    return distinctCount < 10 ? 75 : 55
  },
})

// Rule: Convert to date
registerRule({
  id: 'convert_to_date',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    const dateLikeCount = meta.columnProfile.topValues.filter(v => 
      looksLikeDate(v.value)
    ).length
    
    return dateLikeCount >= meta.columnProfile.topValues.length * 0.7
  },
  build: (ctx, meta) => ({
    id: createSuggestionId('convert_to_date', ctx.tableId, meta.column?.id),
    category: 'cleaning',
    scope: 'column',
    title: `Convert "${meta.column!.name}" to date`,
    description: `This column contains date-like strings that can be converted to proper dates.`,
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
    },
    why: [
      'Values match common date patterns',
      'Date type enables time-based analysis',
      'Proper sorting and filtering by date',
    ],
    impact: {
      kind: 'derivedTable',
      summary: `Converts column to date type`,
    },
    action: {
      kind: 'createDerivedTable',
      transform: {
        type: 'calculated_column',
        sourceTableId: ctx.tableId,
        newColumnName: `${meta.column!.name}_date`,
        expression: `DATE("${meta.column!.id}")`,
      },
      tableName: `${ctx.tableName} (with dates)`,
      openAfterApply: true,
    },
  }),
  score: (_ctx, _meta) => 80,
})

// Rule: Convert to number
registerRule({
  id: 'convert_to_number',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    const numericCount = meta.columnProfile.topValues.filter(v => 
      v.value === null || looksLikeNumber(v.value)
    ).length
    
    return numericCount >= meta.columnProfile.topValues.length * 0.8
  },
  build: (ctx, meta) => ({
    id: createSuggestionId('convert_to_number', ctx.tableId, meta.column?.id),
    category: 'cleaning',
    scope: 'column',
    title: `Convert "${meta.column!.name}" to number`,
    description: `This column contains numeric values stored as text.`,
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
    },
    why: [
      'Values appear to be numeric',
      'Enables mathematical operations',
      'Proper numeric sorting and comparisons',
    ],
    impact: {
      kind: 'derivedTable',
      summary: `Converts column to numeric type`,
    },
    action: {
      kind: 'createDerivedTable',
      transform: {
        type: 'calculated_column',
        sourceTableId: ctx.tableId,
        newColumnName: `${meta.column!.name}_num`,
        expression: `NUMBER("${meta.column!.id}")`,
      },
      tableName: `${ctx.tableName} (converted)`,
      openAfterApply: true,
    },
  }),
  score: (_ctx, _meta) => 82,
})

// Rule: Fill missing values
registerRule({
  id: 'fill_missing',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.columnProfile) return false
    return meta.columnProfile.missingPercent > 5 && meta.columnProfile.missingPercent < 100
  },
  build: (ctx, meta) => {
    const isNumeric = meta.column?.type === 'number'
    const fillMethod = isNumeric ? 'mean' : 'Unknown'
    
    return {
      id: createSuggestionId('fill_missing', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Fill missing values in "${meta.column!.name}"`,
      description: `${meta.columnProfile!.missingPercent.toFixed(1)}% of values are missing. Fill with ${fillMethod}.`,
      confidence: meta.columnProfile!.missingPercent > 20 ? 'high' : 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: isNumeric 
          ? { type: 'fill_missing_numeric', strategy: 'mean' as const }
          : { type: 'fill_missing_string', value: 'Unknown' },
      },
      why: [
        `${meta.columnProfile!.missingPercent.toFixed(1)}% values are missing`,
        'Missing data can affect calculations',
        'May cause issues in joins and aggregations',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Fills ${meta.columnProfile!.missingCount} missing values`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    }
  },
  score: (_ctx, meta) => {
    const missing = meta.columnProfile?.missingPercent ?? 0
    if (missing > 30) return 85
    if (missing > 15) return 70
    return 55
  },
})

// Rule: Find duplicates
registerRule({
  id: 'find_duplicates',
  category: 'cleaning',
  scope: 'column',
  when: (ctx, meta) => {
    if (!meta.column?.semanticHints?.includes('id')) return false
    if (!meta.columnProfile || !ctx.profile) return false
    
    return meta.columnProfile.distinctCount < ctx.profile.rowCount
  },
  build: (ctx, meta) => {
    const dupCount = ctx.profile!.rowCount - meta.columnProfile!.distinctCount
    const dupRate = (dupCount / ctx.profile!.rowCount * 100).toFixed(1)
    
    return {
      id: createSuggestionId('find_duplicates', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Find duplicates in "${meta.column!.name}"`,
      description: `This ID column has ${dupRate}% duplicate values (${dupCount} rows).`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `Found ${dupCount} duplicate ID values`,
        'ID columns should typically be unique',
        'May indicate data quality issues',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates deduplicated table`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [meta.column!.id],
          aggregations: ctx.schema.columns
            .filter(c => c.id !== meta.column!.id)
            .slice(0, 5)
            .map(c => ({
              columnId: c.id,
              operation: c.type === 'number' ? 'sum' as const : 'count' as const,
              alias: c.type === 'number' ? `${c.name}_total` : `${c.name}_count`,
            })),
        },
        tableName: `${ctx.tableName} (deduplicated)`,
        openAfterApply: true,
      },
    }
  },
  score: (ctx, meta) => {
    const dupRate = (ctx.profile!.rowCount - meta.columnProfile!.distinctCount) / ctx.profile!.rowCount
    return dupRate > 0.1 ? 90 : 70
  },
})

// Rule: Split delimiter
registerRule({
  id: 'split_delimiter',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    return hasConsistentDelimiter(meta.columnProfile.topValues) !== null
  },
  build: (ctx, meta) => {
    const delimiter = hasConsistentDelimiter(meta.columnProfile!.topValues!)!
    
    return {
      id: createSuggestionId('split_column', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Split "${meta.column!.name}" by "${delimiter}"`,
      description: `Values contain consistent "${delimiter}" delimiters that can be split into columns.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `Detected consistent "${delimiter}" delimiter`,
        'Splitting can normalize data structure',
        'Creates separate columns for each part',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Splits into multiple columns`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'calculated_column',
          sourceTableId: ctx.tableId,
          newColumnName: `${meta.column!.name}_split`,
          expression: `SPLIT("${meta.column!.id}", "${delimiter}")`,
        },
        tableName: `${ctx.tableName} (split)`,
        openAfterApply: true,
      },
    }
  },
  score: (_ctx, _meta) => 60,
})

// Rule: Detect typos (near-duplicates)
registerRule({
  id: 'detect_typos',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    // Skip ID-like columns - they have intentionally different values
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false
    
    // Only for categorical columns with reasonable cardinality
    if ((meta.columnProfile.distinctCount ?? 100) > 50) return false
    
    const typos = findTypos(meta.columnProfile.topValues)
    return typos.length > 0
  },
  build: (ctx, meta) => {
    const typos = findTypos(meta.columnProfile!.topValues!)
    const mappings: Record<string, string> = {}
    for (const t of typos) {
      mappings[t.from] = t.to
    }
    
    const examples = typos.slice(0, 2).map(t => `"${t.from}" → "${t.to}"`).join(', ')
    
    return {
      id: createSuggestionId('detect_typos', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Fix typos in "${meta.column!.name}"`,
      description: `Found ${typos.length} possible typo(s): ${examples}`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'replace_typos', mappings },
      },
      why: [
        `Found similar values that may be typos`,
        ...typos.slice(0, 2).map(t => `"${t.from}" (${t.fromCount}x) similar to "${t.to}" (${t.toCount}x)`),
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Corrects ${typos.length} typo(s)`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    }
  },
  score: (_ctx, meta) => {
    const typos = findTypos(meta.columnProfile!.topValues!)
    return typos.length > 2 ? 80 : 65
  },
})

// Rule: Detect and convert placeholder values to NULL
registerRule({
  id: 'detect_placeholders',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    const { placeholders } = findPlaceholders(meta.columnProfile.topValues)
    return placeholders.length > 0
  },
  build: (ctx, meta) => {
    const { placeholders } = findPlaceholders(meta.columnProfile!.topValues!)
    
    return {
      id: createSuggestionId('detect_placeholders', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Convert placeholders to NULL in "${meta.column!.name}"`,
      description: `Found placeholder value(s) that will be converted to NULL`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'nullify_placeholders', placeholders: [] },
      },
      why: [
        `Found ${placeholders.length} placeholder type(s)`,
        'Placeholders should be proper NULLs',
        'Improves aggregation accuracy',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Converts placeholder(s) to NULL`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    }
  },
  score: (_ctx, _meta) => 85,
})

// Rule: Standardize date formats
registerRule({
  id: 'standardize_date_format',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    const formats = detectDateFormats(meta.columnProfile.topValues)
    return formats.size > 1  // Multiple different formats
  },
  build: (ctx, meta) => {
    const formats = detectDateFormats(meta.columnProfile!.topValues!)
    
    return {
      id: createSuggestionId('standardize_date_format', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Standardize date format in "${meta.column!.name}"`,
      description: `Found ${formats.size} different date formats: ${Array.from(formats).join(', ')}`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'standardize_date', outputFormat: '%Y-%m-%d' },
      },
      why: [
        `Detected ${formats.size} different date formats`,
        'Inconsistent formats cause sorting issues',
        'Standardizing to ISO format (YYYY-MM-DD)',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Standardizes dates to YYYY-MM-DD format`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    }
  },
  score: (_ctx, _meta) => 90,
})

// Rule: Convert numeric timestamps to dates
registerRule({
  id: 'numeric_timestamp',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'number') return false
    if (!meta.columnProfile) return false
    
    return looksLikeTimestamp(meta.columnProfile.min, meta.columnProfile.max) !== null
  },
  build: (ctx, meta) => {
    const unit = looksLikeTimestamp(meta.columnProfile!.min, meta.columnProfile!.max)!
    const minDate = new Date(unit === 'milliseconds' ? meta.columnProfile!.min! : meta.columnProfile!.min! * 1000)
    const maxDate = new Date(unit === 'milliseconds' ? meta.columnProfile!.max! : meta.columnProfile!.max! * 1000)
    
    return {
      id: createSuggestionId('epoch_to_date', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Convert "${meta.column!.name}" to date`,
      description: `This column contains ${unit} timestamps (${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]})`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'epoch_to_date', unit },
      },
      why: [
        `Values are Unix timestamps (${unit})`,
        `Range: ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`,
        'Converting enables date-based analysis',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Converts timestamps to proper dates`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    }
  },
  score: (_ctx, _meta) => 88,
})

// Rule: Detect outliers
registerRule({
  id: 'detect_outliers',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'number') return false
    if (!meta.columnProfile) return false
    
    // Skip ID-like columns
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false
    
    const result = detectOutliers(meta.columnProfile)
    return result !== null && result.hasOutliers
  },
  build: (ctx, meta) => {
    const { lowerBound, upperBound } = detectOutliers(meta.columnProfile!)!
    const { min, max, q1, q3 } = meta.columnProfile!
    
    const outlierInfo: string[] = []
    if (min !== undefined && min < lowerBound) outlierInfo.push(`Min (${min.toFixed(2)}) below threshold`)
    if (max !== undefined && max > upperBound) outlierInfo.push(`Max (${max.toFixed(2)}) above threshold`)
    
    return {
      id: createSuggestionId('detect_outliers', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Outliers in "${meta.column!.name}"`,
      description: `Values outside [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}] will be highlighted for review`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        // Use highlight_outliers instead of remove_outliers
        cleaningOperation: { type: 'highlight_outliers', lowerBound, upperBound },
      },
      why: [
        ...outlierInfo,
        `Normal range (IQR): ${q1?.toFixed(1)} to ${q3?.toFixed(1)}`,
        'Review these values - they may be errors or valid edge cases',
      ],
      impact: {
        kind: 'patch',
        summary: `Highlights outlier values for review`,
      },
      action: {
        kind: 'highlightCells',
        cells: [], // Will be populated at apply time
        target: 'source',
      },
    }
  },
  score: (_ctx, _meta) => 70,
})

// ============================================================================
// Analysis Rules (Table-scoped)
// ============================================================================

// Rule: Trend chart
registerRule({
  id: 'trend_chart',
  category: 'analysis',
  scope: 'table',
  when: (_ctx, meta) => {
    const hasDate = meta.schema.columns.some(c => c.type === 'date' || c.type === 'datetime')
    const hasNumeric = meta.schema.columns.some(c => c.type === 'number')
    return hasDate && hasNumeric
  },
  build: (ctx, meta) => {
    const dateCol = meta.schema.columns.find(c => c.type === 'date' || c.type === 'datetime')!
    const numericCol = meta.schema.columns.find(c => c.type === 'number')!
    
    return {
      id: createSuggestionId('trend_chart', ctx.tableId, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `${numericCol.name} trend over time`,
      description: `Visualize how ${numericCol.name} changes over ${dateCol.name}.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has date and numeric columns',
        'Time series analysis reveals trends',
        'Identify patterns and seasonality',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates line chart`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'line',
          sourceTableId: ctx.tableId,
          title: `${numericCol.name} over ${dateCol.name}`,
          config: {
            xAxis: dateCol.id,
            yAxis: numericCol.id,
            aggregation: 'sum',
          },
        },
        addToDashboard: false,
      },
    }
  },
  score: (_ctx, _meta) => 85,
})

// Helper: Check if column looks like a category based on name
function looksLikeCategoryByName(columnName: string): boolean {
  const name = columnName.toLowerCase()
  return name.includes('category') || name.includes('type') || name.includes('status') ||
         name.includes('group') || name.includes('class') || name.includes('segment') ||
         name.includes('region') || name.includes('country') || name.includes('state') ||
         name.includes('department') || name.includes('product') || name.includes('brand')
}

// Rule: Category breakdown
registerRule({
  id: 'category_breakdown',
  category: 'analysis',
  scope: 'table',
  when: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0
    
    // Find a suitable categorical column using classification
    const hasCategorical = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'low_cardinality_cat'
    })
    
    // Find a suitable numeric column (continuous or discrete, but not ID)
    const hasNumeric = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'continuous_numeric' || classification === 'discrete_numeric'
    })
    
    return hasCategorical && hasNumeric
  },
  build: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0
    
    // Find the best categorical column
    const catCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'low_cardinality_cat'
    })!
    
    // Find the best numeric column
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'continuous_numeric' || classification === 'discrete_numeric'
    })!
    
    return {
      id: createSuggestionId('category_breakdown', ctx.tableId, catCol.id),
      category: 'analysis',
      scope: 'table',
      title: `${numericCol.name} by ${catCol.name}`,
      description: `Break down ${numericCol.name} by ${catCol.name} categories.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has categorical and numeric columns',
        'Understand composition by category',
        'Identify top contributors',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates bar chart with ${meta.profile?.columns.find(p => p.columnId === catCol.id)?.distinctCount ?? 'multiple'} categories`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'bar',
          sourceTableId: ctx.tableId,
          title: `${numericCol.name} by ${catCol.name}`,
          config: {
            xAxis: catCol.id,
            yAxis: numericCol.id,
            aggregation: 'sum',
            groupBy: catCol.id,
          },
        },
        addToDashboard: false,
      },
    }
  },
  score: (_ctx, _meta) => 80,
})

// Rule: Distribution histogram
registerRule({
  id: 'distribution_histogram',
  category: 'analysis',
  scope: 'column',
  when: (ctx, meta) => {
    if (!meta.column || meta.column.type !== 'number') return false
    if (!meta.columnProfile) return false
    if (meta.columnProfile.min === undefined || meta.columnProfile.max === undefined) return false
    
    // Use classification to ensure we only suggest histograms for continuous numeric data
    const classification = classifyColumn(
      meta.column, 
      meta.columnProfile, 
      ctx.profile?.rowCount ?? 0
    )
    
    // Only suggest histogram for continuous numeric data (not IDs or discrete)
    return classification === 'continuous_numeric'
  },
  build: (ctx, meta) => ({
    id: createSuggestionId('distribution_histogram', ctx.tableId, meta.column!.id),
    category: 'analysis',
    scope: 'column',
    title: `Distribution of ${meta.column!.name}`,
    description: `Analyze the distribution from ${meta.columnProfile!.min?.toLocaleString()} to ${meta.columnProfile!.max?.toLocaleString()}.`,
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
    },
    why: [
      'Numeric column with defined range',
      'Understand value distribution',
      'Identify outliers and patterns',
    ],
    impact: {
      kind: 'chart',
      summary: `Creates histogram`,
    },
    action: {
      kind: 'createChart',
      chart: {
        chartType: 'histogram',
        sourceTableId: ctx.tableId,
        title: `Distribution of ${meta.column!.name}`,
        config: {
          xAxis: meta.column!.id,
          aggregation: 'count',
        },
      },
      addToDashboard: false,
    },
  }),
  score: (_ctx, _meta) => 70,
})

// Rule: Top N analysis
registerRule({
  id: 'top_n_analysis',
  category: 'analysis',
  scope: 'table',
  when: (_ctx, meta) => {
    const hasCategorical = meta.schema.columns.some(c => 
      c.type === 'string' && 
      (meta.profile?.columns.find(p => p.columnId === c.id)?.distinctCount ?? 100) < 50
    )
    const hasNumeric = meta.schema.columns.some(c => c.type === 'number')
    return hasCategorical && hasNumeric
  },
  build: (ctx, meta) => {
    const catCol = meta.schema.columns.find(c => 
      c.type === 'string' && 
      (meta.profile?.columns.find(p => p.columnId === c.id)?.distinctCount ?? 100) < 50
    )!
    const numericCol = meta.schema.columns.find(c => c.type === 'number')!
    
    return {
      id: createSuggestionId('top_n_analysis', ctx.tableId, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `Top contributors to ${numericCol.name}`,
      description: `Identify which ${catCol.name} values contribute most to total ${numericCol.name}.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Pareto analysis (80/20 rule)',
        'Focus on high-impact items',
        'Prioritize attention effectively',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates ranked summary table`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [catCol.id],
          aggregations: [{
            columnId: numericCol.id,
            operation: 'sum',
            alias: `total_${numericCol.name}`,
          }],
        },
        tableName: `Top ${catCol.name} by ${numericCol.name}`,
        openAfterApply: true,
      },
    }
  },
  score: (_ctx, _meta) => 65,
})

// ============================================================================
// Recipe Rules (Table-scoped) - Data-Driven Smart Detection
// ============================================================================

// Rule: Smart Aggregation Analysis (any numeric + any category)
registerRule({
  id: 'smart_aggregation',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    if (opportunities.length === 0) return false
    
    // Check if a similar derived table already exists
    const best = opportunities[0]
    const groupCol = best.groupColumns[0].column
    
    // Check if a similar derived table already exists
    if (ctx.existingDerivedTables?.some(dt => 
      dt.transformType === 'group_summarize' && 
      dt.groupByColumns?.includes(groupCol.id)
    )) {
      return false // Already have this aggregation
    }
    
    return true
  },
  build: (ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    const best = opportunities[0]
    const groupCol = best.groupColumns[0].column
    
    return {
      id: createSuggestionId('smart_aggregation', ctx.tableId, best.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `Summarize ${best.valueColumn.name} by ${groupCol.name}`,
      description: `Calculate totals and averages of ${best.valueColumn.name} grouped by ${groupCol.name}.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `"${best.valueColumn.name}" is a numeric column suitable for aggregation`,
        `"${groupCol.name}" has ${best.groupColumns[0].profile?.distinctCount ?? 'few'} distinct categories`,
        'Grouping reveals patterns across categories',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates summary table with totals by ${groupCol.name}`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [groupCol.id],
          aggregations: [
            { columnId: best.valueColumn.id, operation: 'sum', alias: `Total ${best.valueColumn.name}` },
            { columnId: best.valueColumn.id, operation: 'avg', alias: `Avg ${best.valueColumn.name}` },
            { columnId: best.valueColumn.id, operation: 'count', alias: 'Count' },
          ],
        },
        tableName: `${best.valueColumn.name} by ${groupCol.name}`,
        openAfterApply: true,
      },
    }
  },
  score: (_ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    // Higher score if the category has good cardinality
    const cardScore = opportunities[0]?.groupColumns[0]?.profile?.distinctCount
    if (cardScore && cardScore >= 3 && cardScore <= 20) return 85
    return 70
  },
})

// Rule: Smart Time Series Analysis (date + numeric with period detection)
registerRule({
  id: 'smart_time_series',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(meta.schema, meta.profile?.columns, meta.profile?.rowCount)
    return opportunities.length > 0
  },
  build: (ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(meta.schema, meta.profile?.columns, meta.profile?.rowCount)
    const best = opportunities[0]
    const periodLabel = best.suggestedPeriod.charAt(0).toUpperCase() + best.suggestedPeriod.slice(1)
    
    return {
      id: createSuggestionId('smart_time_series', ctx.tableId, best.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `${best.valueColumn.name} trend over time`,
      description: `Analyze how ${best.valueColumn.name} changes over ${best.dateColumn.name}. Suggested grouping: ${periodLabel}ly.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `"${best.dateColumn.name}" contains date/time data`,
        `"${best.valueColumn.name}" is a numeric metric`,
        `Data appears to be ${best.suggestedPeriod}ly - grouping by ${best.suggestedPeriod} recommended`,
      ],
      impact: {
        kind: 'recipe',
        summary: `Creates trend summary grouped by ${best.suggestedPeriod}`,
      },
      action: {
        kind: 'launchRecipe',
        recipeId: 'trend_summary',
        initialBindings: {
          dateColumnId: best.dateColumn.id,
          valueColumnId: best.valueColumn.id,
          period: best.suggestedPeriod,
        },
      },
    }
  },
  score: (_ctx, _meta) => 80,
})

// Rule: Smart Comparison Analysis (two similar numeric columns)
registerRule({
  id: 'smart_comparison',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const opportunities = detectComparisonOpportunities(meta.schema, meta.profile?.columns)
    // Only suggest if we have at least two comparable numerics
    if (opportunities.length === 0 || opportunities[0].similarity <= 0.3) return false
    
    // Check if a calculated_column derived table already exists from this source
    if (ctx.existingDerivedTables?.some(dt => dt.transformType === 'calculated_column')) {
      return false // Already have a calculated column
    }
    
    return true
  },
  build: (ctx, meta) => {
    const opportunities = detectComparisonOpportunities(meta.schema, meta.profile?.columns)
    const best = opportunities[0]
    
    // Determine if this looks like a variance scenario (similar ranges = comparable metrics)
    const isVarianceLike = best.similarity > 0.6
    
    if (isVarianceLike) {
      return {
        id: createSuggestionId('smart_comparison', ctx.tableId, best.column1.id, best.column2.id),
        category: 'recipe',
        scope: 'table',
        title: `Compare ${best.column1.name} vs ${best.column2.name}`,
        description: `These columns have similar value ranges - calculate the difference and variance.`,
        confidence: 'high',
        context: {
          tableId: ctx.tableId,
          tableVersionHash: getVersionHash(ctx),
        },
        why: [
          'Both columns have similar value ranges',
          'May represent comparable metrics (actual vs expected, before vs after)',
          'Difference analysis reveals discrepancies',
        ],
        impact: {
          kind: 'derivedTable',
          summary: `Creates table with difference and % variance`,
        },
        action: {
          kind: 'createDerivedTable',
          transform: {
            type: 'calculated_column',
            sourceTableId: ctx.tableId,
            newColumnName: `${best.column1.name} vs ${best.column2.name} Diff`,
            expression: `("${best.column1.id}" - "${best.column2.id}")`,
          },
          tableName: `${ctx.tableName} (with comparison)`,
          openAfterApply: true,
        },
      }
    } else {
      // Different ranges - suggest ratio
      return {
        id: createSuggestionId('smart_comparison_ratio', ctx.tableId, best.column1.id, best.column2.id),
        category: 'recipe',
        scope: 'table',
        title: `Calculate ${best.column1.name} / ${best.column2.name} ratio`,
        description: `Create a ratio to normalize and compare these metrics.`,
        confidence: 'medium',
        context: {
          tableId: ctx.tableId,
          tableVersionHash: getVersionHash(ctx),
        },
        why: [
          'Found two numeric columns',
          'Ratios help normalize different scales',
          'Useful for calculating rates and percentages',
        ],
        impact: {
          kind: 'derivedTable',
          summary: `Adds ratio column`,
        },
        action: {
          kind: 'createDerivedTable',
          transform: {
            type: 'calculated_column',
            sourceTableId: ctx.tableId,
            newColumnName: `${best.column1.name} per ${best.column2.name}`,
            expression: `("${best.column1.id}" / NULLIF("${best.column2.id}", 0))`,
          },
          tableName: `${ctx.tableName} (with ratio)`,
          openAfterApply: true,
        },
      }
    }
  },
  score: (_ctx, meta) => {
    const opportunities = detectComparisonOpportunities(meta.schema, meta.profile?.columns)
    if (opportunities.length > 0 && opportunities[0].similarity > 0.6) return 85
    return 65
  },
})

// Rule: Legacy Variance analysis (name-based, lower priority)
registerRule({
  id: 'variance_analysis',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) => {
    const actualCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('actual') || 
      c.name.toLowerCase().includes('real')
    )
    const budgetCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('budget') || 
      c.name.toLowerCase().includes('plan') ||
      c.name.toLowerCase().includes('target') ||
      c.name.toLowerCase().includes('forecast')
    )
    return actualCol !== undefined && budgetCol !== undefined
  },
  build: (ctx, meta) => {
    const actualCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('actual') || 
      c.name.toLowerCase().includes('real')
    )!
    const budgetCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('budget') || 
      c.name.toLowerCase().includes('plan') ||
      c.name.toLowerCase().includes('target') ||
      c.name.toLowerCase().includes('forecast')
    )!
    
    return {
      id: createSuggestionId('variance_analysis', ctx.tableId, actualCol.id, budgetCol.id),
      category: 'recipe',
      scope: 'table',
      title: 'Variance Analysis',
      description: `Compare ${actualCol.name} vs ${budgetCol.name} with variance calculations.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Detected actual/budget column pattern',
        'Common in financial analysis',
        'Track performance vs targets',
      ],
      impact: {
        kind: 'recipe',
        summary: `Creates variance table with absolute and % variance`,
      },
      action: {
        kind: 'launchRecipe',
        recipeId: 'variance_analysis',
        initialBindings: {
          actualColumnId: actualCol.id,
          budgetColumnId: budgetCol.id,
        },
      },
    }
  },
  score: (_ctx, _meta) => 90,
})

// Rule: Period-over-period (kept for recipe wizard)
registerRule({
  id: 'period_over_period',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) => {
    // Only trigger if smart_time_series didn't already cover this
    const hasDate = meta.schema.columns.some(c => c.type === 'date' || c.type === 'datetime')
    const hasNumeric = meta.schema.columns.filter(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isAnalyzableNumeric(c, profile)
    }).length > 0
    return hasDate && hasNumeric
  },
  build: (ctx, meta) => {
    const dateCol = meta.schema.columns.find(c => c.type === 'date' || c.type === 'datetime')!
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isAnalyzableNumeric(c, profile)
    })!
    
    return {
      id: createSuggestionId('period_over_period', ctx.tableId, numericCol.id),
      category: 'recipe',
      scope: 'table',
      title: 'Period-over-Period Analysis',
      description: `Calculate changes between time periods for ${numericCol.name}.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has time and value data',
        'Compare performance across periods',
        'Calculate growth rates',
      ],
      impact: {
        kind: 'recipe',
        summary: `Creates table with period comparisons`,
      },
      action: {
        kind: 'launchRecipe',
        recipeId: 'period_over_period',
        initialBindings: {
          dateColumnId: dateCol.id,
          valueColumnId: numericCol.id,
        },
      },
    }
  },
  score: (_ctx, _meta) => 60, // Lower than smart_time_series
})

// Rule: Ratio KPI (kept for specific patterns)
registerRule({
  id: 'ratio_kpi',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const numericCols = meta.schema.columns.filter(c => c.type === 'number')
    if (numericCols.length < 2) return false
    
    // Check if a calculated_column derived table already exists
    if (ctx.existingDerivedTables?.some(dt => dt.transformType === 'calculated_column')) {
      return false
    }
    
    // Look for meaningful ratio patterns
    const name1 = numericCols[0].name.toLowerCase()
    const name2 = numericCols[1].name.toLowerCase()
    
    return (
      (name1.includes('gross') && name2.includes('revenue')) ||
      (name1.includes('profit') && name2.includes('revenue')) ||
      (name1.includes('cost') && name2.includes('revenue')) ||
      (name1.includes('net') && name2.includes('gross')) ||
      (name1.includes('margin') || name2.includes('margin'))
    )
  },
  build: (ctx, meta) => {
    const numericCols = meta.schema.columns.filter(c => c.type === 'number')
    const [num1, num2] = numericCols
    
    return {
      id: createSuggestionId('ratio_kpi', ctx.tableId, num1.id, num2.id),
      category: 'recipe',
      scope: 'table',
      title: `Calculate ${num1.name} / ${num2.name} Ratio`,
      description: `Create a ratio KPI from these related metrics.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Detected related numeric columns',
        'Ratios normalize for comparison',
        'Common business KPI pattern',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Adds calculated ratio column`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'calculated_column',
          sourceTableId: ctx.tableId,
          newColumnName: `${num1.name}_ratio`,
          expression: `("${num1.id}" / NULLIF("${num2.id}", 0)) * 100`,
        },
        tableName: `${ctx.tableName} (with ratios)`,
        openAfterApply: true,
      },
    }
  },
  score: (_ctx, _meta) => 65,
})

// ============================================================================
// Schema-Only Fallback Rules (Work without profile data)
// ============================================================================

// Fallback Rule: Create summary table (always available for string+number tables)
registerRule({
  id: 'create_summary_fallback',
  category: 'analysis',
  scope: 'table',
  when: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0
    
    // Find a suitable categorical column for grouping
    const hasCategorical = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'low_cardinality_cat' || classification === 'high_cardinality_cat'
    })
    
    // Find a suitable numeric column (not an ID)
    const hasNumeric = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'continuous_numeric' || classification === 'discrete_numeric'
    })
    
    return hasCategorical && hasNumeric
  },
  build: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0
    
    // Prefer low cardinality for grouping
    const stringCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'low_cardinality_cat'
    }) || meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'high_cardinality_cat'
    })!
    
    // Find the best numeric column
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'continuous_numeric' || classification === 'discrete_numeric'
    })!
    
    return {
      id: createSuggestionId('create_summary_fallback', ctx.tableId, stringCol.id, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `Summarize ${numericCol.name} by ${stringCol.name}`,
      description: `Group data and calculate totals.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has text and numeric columns',
        'Grouping reveals patterns',
        'Common analysis starting point',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates summary table`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [stringCol.id],
          aggregations: [
            { columnId: numericCol.id, operation: 'sum', alias: `Total ${numericCol.name}` },
            { columnId: numericCol.id, operation: 'count', alias: 'Count' },
          ],
        },
        tableName: `${ctx.tableName} (Summary)`,
        openAfterApply: true,
      },
    }
  },
  score: (_ctx, _meta) => 60,
})

// Fallback Rule: Bar chart (always available for string+number tables)
registerRule({
  id: 'bar_chart_fallback',
  category: 'analysis',
  scope: 'table',
  when: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0
    
    // Find a suitable categorical column (low or high cardinality, not text/unique)
    const hasCategorical = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'low_cardinality_cat' || classification === 'high_cardinality_cat'
    })
    
    // Find a suitable numeric column (not an ID)
    const hasNumeric = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'continuous_numeric' || classification === 'discrete_numeric'
    })
    
    return hasCategorical && hasNumeric
  },
  build: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0
    
    // Prefer low cardinality, fall back to high cardinality
    const stringCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'low_cardinality_cat'
    }) || meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'high_cardinality_cat'
    })!
    
    // Find the best numeric column
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      const classification = classifyColumn(c, profile, rowCount)
      return classification === 'continuous_numeric' || classification === 'discrete_numeric'
    })!
    
    return {
      id: createSuggestionId('bar_chart_fallback', ctx.tableId, stringCol.id, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `Chart: ${numericCol.name} by ${stringCol.name}`,
      description: `Visualize values grouped by category.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has categorical and numeric data',
        'Charts reveal distribution patterns',
        'Great for presentations',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates bar chart`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'bar',
          sourceTableId: ctx.tableId,
          title: `${numericCol.name} by ${stringCol.name}`,
          config: {
            xAxis: stringCol.id,
            yAxis: numericCol.id,
            aggregation: 'sum',
          },
        },
        addToDashboard: false,
      },
    }
  },
  score: (_ctx, _meta) => 55,
})

// Fallback Rule: Detect potential column type issues
registerRule({
  id: 'detect_type_issues_fallback',
  category: 'cleaning',
  scope: 'table',
  when: (_ctx, meta) => {
    // Check for columns that might have wrong type based on name
    return meta.schema.columns.some(c => {
      const name = c.name.toLowerCase()
      // Date-like names but not date type
      if ((name.includes('date') || name.includes('time') || name.includes('created') || 
           name.includes('updated') || name.includes('at')) && 
          c.type !== 'date' && c.type !== 'datetime') {
        return true
      }
      // ID-like names but not string type
      if ((name.includes('id') || name.includes('code') || name.includes('key')) && 
          c.type === 'number') {
        return true
      }
      return false
    })
  },
  build: (ctx, meta) => {
    const suspectCols = meta.schema.columns.filter(c => {
      const name = c.name.toLowerCase()
      return (name.includes('date') || name.includes('id') || name.includes('code')) &&
             c.type !== 'date' && c.type !== 'datetime'
    })
    
    return {
      id: createSuggestionId('review_column_types', ctx.tableId),
      category: 'cleaning',
      scope: 'table',
      title: `Review column types`,
      description: `Some columns may have incorrect types: ${suspectCols.slice(0, 2).map(c => c.name).join(', ')}`,
      confidence: 'low',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Column names suggest different types',
        'Correct types enable better analysis',
        'May improve filtering and sorting',
      ],
      impact: {
        kind: 'patch',
        summary: `Manual review recommended`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'source',
      },
    }
  },
  score: (_ctx, _meta) => 40,
})

// ============================================================================
// Main Generation Functions
// ============================================================================

interface ScoredSuggestion {
  suggestion: Suggestion
  score: number
}

/**
 * Generate all suggestions for a table
 */
export function generateSuggestions(context: SuggestionEngineContext): Suggestion[] {
  console.log('[SuggestionEngine] Starting generation with:', {
    tableId: context.tableId,
    schemaColumns: context.schema.columns.length,
    hasProfile: !!context.profile,
    profileColumns: context.profile?.columns.length,
    ruleCount: suggestionRules.length,
  })
  
  const scored: ScoredSuggestion[] = []
  
  // Prepare metadata bundle
  const meta: MetadataBundle = {
    schema: context.schema,
    profile: context.profile,
  }
  
  // Process table-scoped rules
  const tableRules = suggestionRules.filter(r => r.scope === 'table')
  console.log('[SuggestionEngine] Processing', tableRules.length, 'table-scoped rules')
  
  for (const rule of tableRules) {
    try {
      const matches = rule.when(context, meta)
      console.log(`[SuggestionEngine] Rule "${rule.id}": ${matches ? 'MATCHED' : 'skipped'}`)
      if (matches) {
        const suggestion = rule.build(context, meta)
        const score = rule.score(context, meta)
        scored.push({ suggestion, score })
      }
    } catch (error) {
      console.error(`[SuggestionEngine] Rule "${rule.id}" threw error:`, error)
    }
  }
  
  // Process column-scoped rules for each column
  const columnRules = suggestionRules.filter(r => r.scope === 'column')
  console.log('[SuggestionEngine] Processing', columnRules.length, 'column-scoped rules for', context.schema.columns.length, 'columns')
  
  for (const column of context.schema.columns) {
    const columnMeta: MetadataBundle = {
      ...meta,
      column,
      columnProfile: context.profile?.columns.find(p => p.columnId === column.id),
    }
    
    for (const rule of columnRules) {
      try {
        if (rule.when(context, columnMeta)) {
          const suggestion = rule.build(context, columnMeta)
          const score = rule.score(context, columnMeta)
          scored.push({ suggestion, score })
        }
      } catch (error) {
        console.error(`[SuggestionEngine] Column rule "${rule.id}" for "${column.name}" threw error:`, error)
      }
    }
  }
  
  console.log('[SuggestionEngine] Total scored suggestions:', scored.length)
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)
  
  // Apply limits: 10 cleaning, 3 analysis, 2 recipes, max 15 total
  const result: Suggestion[] = []
  const counts = { cleaning: 0, analysis: 0, recipe: 0 }
  const limits = { cleaning: 10, analysis: 3, recipe: 2 }
  
  for (const { suggestion } of scored) {
    if (result.length >= 15) break
    
    const cat = suggestion.category
    if (counts[cat] < limits[cat]) {
      result.push(suggestion)
      counts[cat]++
    }
  }
  
  console.log('[SuggestionEngine] Final suggestions:', result.length, result.map(s => s.title))
  
  return result
}

/**
 * Get contextual suggestions for a selected column
 */
export function getColumnSuggestions(context: SuggestionEngineContext): Suggestion[] {
  if (!context.selectedColumnId) return []
  
  const column = context.schema.columns.find(c => c.id === context.selectedColumnId)
  if (!column) return []
  
  const scored: ScoredSuggestion[] = []
  
  const meta: MetadataBundle = {
    schema: context.schema,
    profile: context.profile,
    column,
    columnProfile: context.profile?.columns.find(p => p.columnId === column.id),
  }
  
  // Only process column-scoped rules for the selected column
  for (const rule of suggestionRules.filter(r => r.scope === 'column')) {
    if (rule.when(context, meta)) {
      const suggestion = rule.build(context, meta)
      const score = rule.score(context, meta)
      scored.push({ suggestion, score })
    }
  }
  
  // Also include table-scoped rules that involve this column
  const tableMeta: MetadataBundle = {
    schema: context.schema,
    profile: context.profile,
  }
  
  for (const rule of suggestionRules.filter(r => r.scope === 'table')) {
    if (rule.when(context, tableMeta)) {
      const suggestion = rule.build(context, tableMeta)
      
      // Check if this suggestion involves the selected column
      const action = suggestion.action
      let involvesColumn = false
      
      if (action.kind === 'createChart') {
        const config = action.chart.config
        involvesColumn = config.xAxis === context.selectedColumnId || 
                         config.yAxis === context.selectedColumnId ||
                         config.groupBy === context.selectedColumnId
      } else if (action.kind === 'createDerivedTable') {
        const transform = action.transform as TransformDef
        if (transform.type === 'group_summarize') {
          involvesColumn = transform.groupByColumns.includes(context.selectedColumnId!) ||
                           transform.aggregations.some(a => a.columnId === context.selectedColumnId)
        } else if (transform.type === 'calculated_column') {
          involvesColumn = transform.expression.includes(context.selectedColumnId!)
        }
      }
      
      if (involvesColumn) {
        const score = rule.score(context, tableMeta)
        scored.push({ suggestion, score })
      }
    }
  }
  
  // Sort by score and apply limits
  scored.sort((a, b) => b.score - a.score)
  
  const result: Suggestion[] = []
  const counts = { cleaning: 0, analysis: 0, recipe: 0 }
  const limits = { cleaning: 10, analysis: 3, recipe: 2 }
  
  for (const { suggestion } of scored) {
    if (result.length >= 15) break
    
    const cat = suggestion.category
    if (counts[cat] < limits[cat]) {
      result.push(suggestion)
      counts[cat]++
    }
  }
  
  return result
}

// ============================================================================
// Exports for testing
// ============================================================================

export const __testing = {
  hasMixedCase,
  findPlaceholders,
  getMixedCaseVariants,
  looksLikeIdColumn,
  hasSequentialPattern,
  hasLeadingTrailingWhitespace,
  PLACEHOLDER_VALUES, // Re-exported from cleaningConstants
  // Column classification functions
  classifyColumn,
  isUniqueIdentifier,
  classifyNumericColumn,
  classifyStringColumn,
}
