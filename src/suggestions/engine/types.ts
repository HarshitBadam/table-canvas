/**
 * Suggestion Engine Types
 * 
 * Core type definitions for the rule-based suggestion system.
 */

import type {
  Suggestion,
  SuggestionCategory,
  SuggestionScope,
  TableSchema,
  ColumnSchema,
  ColumnProfile,
} from '@/lib/types'

/**
 * Context passed to suggestion rules for evaluation and building.
 */
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
  existingDerivedTables?: Array<{
    id: string
    name: string
    transformType: string
    groupByColumns?: string[]
  }>
}

/**
 * Metadata bundle passed to rules for column-specific context.
 */
export interface MetadataBundle {
  schema: TableSchema
  profile?: {
    columns: ColumnProfile[]
    rowCount: number
  }
  column?: ColumnSchema
  columnProfile?: ColumnProfile
}

/**
 * Interface for a suggestion rule.
 */
export interface SuggestionRule {
  /** Unique rule identifier */
  id: string
  /** Rule category (cleaning, analysis, recipe) */
  category: SuggestionCategory
  /** Rule scope (table, column) */
  scope: SuggestionScope
  /** Condition check - should this rule apply? */
  when: (ctx: SuggestionEngineContext, meta: MetadataBundle) => boolean
  /** Build the suggestion if rule applies */
  build: (ctx: SuggestionEngineContext, meta: MetadataBundle) => Suggestion
  /** Calculate confidence score (0-100) */
  score: (ctx: SuggestionEngineContext, meta: MetadataBundle) => number
}

/**
 * Aggregation opportunity detected in data.
 */
export interface AggregationOpportunity {
  valueColumn: ColumnSchema
  valueProfile?: ColumnProfile
  groupColumns: Array<{
    column: ColumnSchema
    profile?: ColumnProfile
  }>
}

/**
 * Time series opportunity detected in data.
 */
export interface TimeSeriesOpportunity {
  dateColumn: ColumnSchema
  valueColumn: ColumnSchema
  suggestedPeriod: 'day' | 'week' | 'month' | 'quarter' | 'year'
}

/**
 * Column comparison opportunity.
 */
export interface ComparisonOpportunity {
  column1: ColumnSchema
  column2: ColumnSchema
  similarity: number
}

/**
 * Variance analysis opportunity.
 */
export interface VarianceOpportunity {
  valueColumn: ColumnSchema
  groupColumn: ColumnSchema
  expectedVariance: 'high' | 'medium' | 'low'
}

/**
 * Result of generating suggestions.
 */
export interface SuggestionGenerationResult {
  suggestions: Suggestion[]
  stats: {
    rulesEvaluated: number
    suggestionsGenerated: number
    byCategory: Record<SuggestionCategory, number>
  }
}

// ============================================================================
// Detector Types
// ============================================================================

/**
 * Outlier detection result.
 */
export interface OutlierDetection {
  isOutlier: boolean
  value: number
  zscore?: number
  iqrScore?: number
  reason?: string
}

/**
 * Typo match result (for similar string matching).
 */
export interface TypoMatch {
  original: string
  suggestion: string
  similarity: number
  distance: number
}

/**
 * Placeholder value detection result.
 */
export interface PlaceholderDetection {
  value: unknown
  isPlaceholder: boolean
  placeholderType?: 'null' | 'empty' | 'na' | 'none' | 'unknown' | 'tbd' | 'missing'
}
