import type { SemanticHint } from './schema.types'
import type { CellValue } from './common.types'


type CardinalityClass = 'unique' | 'high' | 'low'

/**
 * Column classification for intelligent suggestion generation
 */
export type ColumnClassification = 
  /** >95% unique, sequential pattern, or ID-like name */
  | 'unique_identifier'
  /** Numbers with variance, suitable for histograms */
  | 'continuous_numeric'
  /** Numbers with few distinct values (counts, ratings) */
  | 'discrete_numeric'
  /** String with <20 distinct values - good for pie/bar */
  | 'low_cardinality_cat'
  /** String with 20-95% unique - needs Top N treatment */
  | 'high_cardinality_cat'
  /** Date/datetime - suitable for time series */
  | 'temporal'
  /** Free-form text - not suitable for charts */
  | 'text'
  /** Boolean values - good for pie/bar charts */
  | 'boolean'


export interface ColumnProfile {
  columnId: string
  missingCount: number
  missingPercent: number
  distinctCount: number
  distinctCountExact?: boolean
  topValues?: Array<{ value: CellValue; count: number }>
  
  min?: number
  max?: number
  mean?: number
  median?: number
  /** Standard deviation */
  stdDev?: number
  /** 25th percentile */
  q1?: number
  /** 75th percentile */
  q3?: number
  /** Interquartile range (q3 - q1) */
  iqr?: number
  histogram?: Array<{ bucket: string; count: number }>
  
  minLength?: number
  maxLength?: number
  avgLength?: number
  
  /** 100 - missingPercent */
  completeness: number
  /** Based on distinctCount/rowCount ratio */
  cardinalityClass?: CardinalityClass
  /** Detected patterns (email, URL, phone, etc.) */
  semanticHints?: SemanticHint[]
  /** High uniqueness, low nulls */
  isKeyCandidate?: boolean
}


