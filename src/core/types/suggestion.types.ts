/**
 * Suggestion Type Definitions
 * 
 * Types for the suggestion system.
 */

import type { CellValue } from './schema.types';
import type { TransformDef } from './transform.types';
import type { ChartConfig } from './node.types';

// ============================================================================
// Suggestion Categories
// ============================================================================

export type SuggestionCategory = 'cleaning' | 'analysis' | 'recipe';
export type SuggestionScope = 'table' | 'column';
export type SuggestionConfidence = 'high' | 'medium' | 'low';

// ============================================================================
// Preview Types
// ============================================================================

export type PreviewData =
  | { kind: 'beforeAfter'; rows: Array<{ before: CellValue; after: CellValue }> }
  | { kind: 'tableSample'; columns: string[]; rows: CellValue[][] }
  | { kind: 'aggregateSample'; columns: string[]; rows: CellValue[][] }
  | { kind: 'recipeOutputs'; outputs: Array<{ type: 'table' | 'chart'; name: string }> };

export interface SuggestionPreview {
  status: 'not_loaded' | 'loading' | 'ready' | 'error';
  data?: PreviewData;
  error?: string;
}

// ============================================================================
// Cleaning Operations
// ============================================================================

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
  | { type: 'highlight_outliers'; lowerBound: number; upperBound: number };

// ============================================================================
// Suggestion Context
// ============================================================================

export interface SuggestionContext {
  tableId: string;
  columnId?: string;
  tableVersionHash: string;
  cleaningOperation?: CleaningOperation;
}

// ============================================================================
// Suggestion Impact
// ============================================================================

export interface SuggestionImpact {
  kind: 'patch' | 'derivedTable' | 'chart' | 'recipe';
  summary: string;
}

// ============================================================================
// Suggestion Actions
// ============================================================================

export interface PatchOp {
  rowId: string;
  columnId: string;
  oldValue: CellValue;
  newValue: CellValue;
}

export interface ChartDef {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
  sourceTableId: string;
  title?: string;
  config: ChartConfig;
}

export type SuggestionAction =
  | { 
      kind: 'applyPatch';
      ops: PatchOp[];
      target: 'source' | 'cleanCopy';
    }
  | { 
      kind: 'createDerivedTable';
      transform: TransformDef;
      tableName?: string;
      openAfterApply?: boolean;
    }
  | { 
      kind: 'createChart';
      chart: ChartDef;
      addToDashboard?: boolean;
    }
  | { 
      kind: 'launchRecipe';
      recipeId: string;
      initialBindings?: Record<string, unknown>;
    }
  | {
      kind: 'highlightCells';
      cells: string[];
      target: 'source';
    };

// ============================================================================
// Main Suggestion Interface
// ============================================================================

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  scope: SuggestionScope;
  title: string;
  description?: string;
  confidence: SuggestionConfidence;
  context: SuggestionContext;
  why?: string[];
  impact?: SuggestionImpact;
  preview?: SuggestionPreview;
  action: SuggestionAction;
}

// ============================================================================
// Legacy Types (backward compatibility)
// ============================================================================

export type LegacySuggestionAction = 
  | { type: 'create_derived_table'; transform: TransformDef }
  | { type: 'create_chart'; chartConfig: ChartConfig; sourceTableId: string }
  | { type: 'apply_cleaning'; columnId: string; operation: string };
