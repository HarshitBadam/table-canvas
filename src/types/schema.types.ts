
export type ColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'unknown'

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
  sourceName?: string
  type: ColumnType
  nullable: boolean
  semanticHints?: SemanticHint[]
  formula?: string
  /** Stable-ID formula used for evaluation; formula remains readable source text. */
  canonicalFormula?: string
  isComputed?: boolean
  duckDbName?: string
}

export interface TableSchema {
  columns: ColumnSchema[]
  rowCount?: number
}
