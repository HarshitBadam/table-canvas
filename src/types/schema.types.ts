
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
  /** 
   * The actual column name used in DuckDB queries.
   * - For source tables: same as `id` (e.g., "col_1_date")
   * - For derived tables: same as `name` (e.g., "Date")
   * This field ensures queries always use what DuckDB expects.
   */
  duckDbName?: string
}

/** Schema definition for a table */
export interface TableSchema {
  columns: ColumnSchema[]
  rowCount?: number
}
