
export type ColumnType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'datetime' 
  | 'unknown'

/** User-selectable column types (excludes auto-detected 'datetime' and 'unknown') */
export type UserColumnType = Extract<ColumnType, 'string' | 'number' | 'boolean' | 'date'>

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


export interface ColumnSchema {
  id: string
  name: string
  type: ColumnType
  nullable: boolean
  semanticHints?: SemanticHint[]
  /** Formula expression for computed columns, e.g., "[unit_price] * [quantity]" */
  formula?: string
  isComputed?: boolean
  /** 
   * The actual column name used in DuckDB queries.
   * - For source tables: same as `id` (e.g., "col_1_date")
   * - For derived tables: same as `name` (e.g., "Date")
   * This field ensures queries always use what DuckDB expects.
   */
  duckDbName?: string
}

export interface TableSchema {
  columns: ColumnSchema[]
  rowCount?: number
}
