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
}

export interface TableSchema {
  columns: ColumnSchema[];
  rowCount?: number;
}

// ============================================================================
// Cell Value Type
// ============================================================================

export type CellValue = string | number | boolean | null;
