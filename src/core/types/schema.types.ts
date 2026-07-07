/**
 * Schema Type Definitions
 * 
 * Types for table and column schemas.
 */

// ============================================================================
// Column Types
// ============================================================================

export type ColumnType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'datetime' 
  | 'unknown';

export type SemanticHint = 
  | 'currency' 
  | 'percentage' 
  | 'id' 
  | 'email' 
  | 'url' 
  | 'phone' 
  | 'zipcode'
  | 'country'
  | 'category';

export interface ColumnSchema {
  id: string;
  name: string;
  type: ColumnType;
  nullable: boolean;
  semanticHints?: SemanticHint[];
  // Formula column support
  formula?: string;           // e.g., "[unit_price] * [quantity]"
  isComputed?: boolean;       // Flag for virtual/computed columns
  /**
   * The actual column name used in DuckDB queries. The engine builds every
   * table (source and derived) from column NAMES, so this always equals `name`.
   * Retained as an optional hint/fallback; consumers should prefer `name`.
   */
  duckDbName?: string;
}

export interface TableSchema {
  columns: ColumnSchema[];
  rowCount?: number;
}

// ============================================================================
// Cell Value Type
// ============================================================================

export type CellValue = string | number | boolean | null;
