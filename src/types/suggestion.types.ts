/**
 * Suggestion types for context-aware recommendations
 */

import type { CellValue, PatchOp } from './common.types'
import type { TransformDef } from './transform.types'
import type { ChartConfig } from './node.types'

// ============================================================================
// Suggestion Metadata
// ============================================================================

/** Categories of suggestions */
export type SuggestionCategory = 'cleaning' | 'analysis' | 'recipe'

/** Scope of suggestion applicability */
export type SuggestionScope = 'table' | 'column'

/** Confidence level for suggestions */
export type SuggestionConfidence = 'high' | 'medium' | 'low'

// ============================================================================
// Preview Data
// ============================================================================

/** Preview data types for lazy loading */
export type PreviewData =
  | { kind: 'beforeAfter'; rows: Array<{ before: CellValue; after: CellValue }> }
  | { kind: 'tableSample'; columns: string[]; rows: CellValue[][] }
  | { kind: 'aggregateSample'; columns: string[]; rows: CellValue[][] }
  | { kind: 'recipeOutputs'; outputs: Array<{ type: 'table' | 'chart'; name: string }> }

/** Preview state for a suggestion */
export interface SuggestionPreview {
  status: 'not_loaded' | 'loading' | 'ready' | 'error'
  data?: PreviewData
  error?: string
}

// ============================================================================
// Cleaning Operations
// ============================================================================

/** Types of cleaning operations that can be applied */
export type CleaningOperation =
  | { type: 'trim' }
  | { type: 'lowercase' }
  | { type: 'uppercase' }
  | { type: 'titlecase' }
  | { type: 'replace_typos'; mappings: Record<string, string> }
  | { type: 'normalize_case'; mappings: Record<string, string> }
  | { type: 'nullify_placeholders'; placeholders: string[] }
  | { type: 'standardize_date'; outputFormat: string }
  | { type: 'epoch_to_date'; unit: 'seconds' | 'milliseconds' }
  | { type: 'fill_missing_numeric'; strategy: 'mean' | 'median' | 'zero' }
  | { type: 'fill_missing_string'; value: string }
  | { type: 'remove_outliers'; lowerBound: number; upperBound: number }
  | { type: 'highlight_outliers'; lowerBound: number; upperBound: number }

// ============================================================================
// Suggestion Context
// ============================================================================

/** Context for a suggestion */
export interface SuggestionContext {
  tableId: string
  columnId?: string
  tableVersionHash: string
  /** Cleaning operation details (used by ApplyPatchCommand to generate SQL) */
  cleaningOperation?: CleaningOperation
}

/** Impact description for a suggestion */
export interface SuggestionImpact {
  kind: 'patch' | 'derivedTable' | 'chart' | 'recipe'
  summary: string
}

// ============================================================================
// Suggestion Actions
// ============================================================================

/** Chart definition for creating charts from suggestions */
export interface ChartDef {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram'
  sourceTableId: string
  title?: string
  config: ChartConfig
}

/** Action types - deterministic and executable */
export type SuggestionAction =
  | { 
      kind: 'applyPatch'
      ops: PatchOp[]
      target: 'source' | 'cleanCopy'
    }
  | { 
      kind: 'createDerivedTable'
      transform: TransformDef
      tableName?: string
      openAfterApply?: boolean 
    }
  | { 
      kind: 'createChart'
      chart: ChartDef
      addToDashboard?: boolean 
    }
  | { 
      kind: 'launchRecipe'
      recipeId: string
      initialBindings?: Record<string, unknown>
    }
  | {
      kind: 'highlightCells'
      cells: string[] // "rowId:columnId" format
      target: 'source'
    }

// ============================================================================
// Suggestion
// ============================================================================

/** Complete suggestion object */
export interface Suggestion {
  id: string
  category: SuggestionCategory
  scope: SuggestionScope
  title: string
  description?: string
  confidence: SuggestionConfidence
  context: SuggestionContext
  why?: string[]
  impact?: SuggestionImpact
  preview?: SuggestionPreview
  action: SuggestionAction
}

// ============================================================================
// Legacy Types (for backward compatibility)
// ============================================================================

/** @deprecated Legacy action types for migration */
export type LegacySuggestionAction = 
  | { type: 'create_derived_table'; transform: TransformDef }
  | { type: 'create_chart'; chartConfig: ChartConfig; sourceTableId: string }
  | { type: 'apply_cleaning'; columnId: string; operation: string }
