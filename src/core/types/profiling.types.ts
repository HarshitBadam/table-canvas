/**
 * Profiling Type Definitions
 * 
 * Types for column and table profiling results.
 */

import type { SemanticHint, CellValue } from './schema.types';

// ============================================================================
// Cardinality Classes
// ============================================================================

export type CardinalityClass = 'unique' | 'high' | 'low';

// Column classification for intelligent suggestion generation
export type ColumnClassification = 
  | 'unique_identifier'      // >95% unique, sequential pattern, or ID-like name
  | 'continuous_numeric'     // Numbers with variance, suitable for histograms
  | 'discrete_numeric'       // Numbers with few distinct values (counts, ratings)
  | 'low_cardinality_cat'    // String with <20 distinct values - good for pie/bar
  | 'high_cardinality_cat'   // String with 20-95% unique - needs Top N treatment  
  | 'temporal'               // Date/datetime - suitable for time series
  | 'text';                  // Free-form text - not suitable for charts

// ============================================================================
// Column Profile
// ============================================================================

export interface ColumnProfile {
  columnId: string;
  missingCount: number;
  missingPercent: number;
  distinctCount: number;
  distinctCountExact?: boolean;
  topValues?: Array<{ value: CellValue; count: number }>;
  // Numeric stats
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  histogram?: Array<{ bucket: string; count: number }>;
  // String stats
  minLength?: number;
  maxLength?: number;
  avgLength?: number;
  // Enhanced profile fields
  completeness: number;
  cardinalityClass?: CardinalityClass;
  semanticHints?: SemanticHint[];
  isKeyCandidate?: boolean;
}

// ============================================================================
// Table Profile
// ============================================================================

export interface TableProfile {
  tableId: string;
  rowCount: number;
  columns: ColumnProfile[];
  keyCandidate?: string[];
  computedAt: string;
  phase: 1 | 2;
}
