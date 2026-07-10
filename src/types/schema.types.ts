
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
   * The actual column name used in DuckDB queries. The engine builds every
   * table (source and derived) from column NAMES, so this always equals `name`.
   * Retained as an optional hint/fallback; consumers should prefer `name`.
   */
  duckDbName?: string
}

export interface TableSchema {
  columns: ColumnSchema[]
  rowCount?: number
}
