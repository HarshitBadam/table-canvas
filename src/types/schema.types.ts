/**
 * Schema-related types for table and column definitions
 */

// ============================================================================
// Column Types
// ============================================================================

/** Supported data types for columns */
export type ColumnType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'datetime' 
  | 'unknown'

/** Semantic hints for enhanced column understanding */
export type SemanticHint = 
  | 'currency' 
  | 'percentage' 
  | 'id' 
  | 'email' 
  | 'url' 
  | 'phone' 
  | 'zipcode'
  | 'country'
  | 'category'

// ============================================================================
// Schema Definitions
// ============================================================================

/** Schema definition for a single column */
export interface ColumnSchema {
  id: string
  name: string
  type: ColumnType
  nullable: boolean
  semanticHints?: SemanticHint[]
  /** Formula expression for computed columns, e.g., "[unit_price] * [quantity]" */
  formula?: string
  /** Flag for virtual/computed columns */
  isComputed?: boolean
}

/** Schema definition for a table */
export interface TableSchema {
  columns: ColumnSchema[]
  rowCount?: number
}
