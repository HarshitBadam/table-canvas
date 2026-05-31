
export type TransformType = 
  | 'join' 
  | 'filter' 
  | 'select' 
  | 'calculated_column' 
  | 'group_summarize'
  | 'union'

export interface Edge {
  id: string
  fromNodeId: string
  toNodeId: string
  transformType: TransformType
}


export type TransformDef = 
  | JoinTransformDef 
  | FilterTransformDef 
  | SelectTransformDef 
  | CalculatedColumnDef
  | GroupSummarizeDef
  | UnionTransformDef

export type JoinType = 'left' | 'inner' | 'right' | 'full'

export interface JoinTransformDef {
  type: 'join'
  leftTableId: string
  rightTableId: string
  joinType: JoinType
  leftKey: string
  rightKey: string
  /** Column IDs to include from left table (if omitted, include all) */
  leftColumns?: string[]
  /** Column IDs to include from right table (join key excluded by default) */
  rightColumns?: string[]
  /** Column naming strategy for disambiguation */
  columnPrefix?: 'table_name' | 'left_right' | 'none'
  leftTableName?: string
  rightTableName?: string
  /** @deprecated Legacy option - use leftColumns instead */
  keepLeftColumns?: string[]
  /** @deprecated Legacy option - use rightColumns instead */
  keepRightColumns?: string[]
}


export type FilterOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'contains' 
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than' 
  | 'less_than' 
  | 'greater_equal' 
  | 'less_equal'
  | 'between'
  | 'is_null' 
  | 'is_not_null'

export interface FilterCondition {
  columnId: string
  operator: FilterOperator
  value?: string | number | boolean | null
  /** Second value for 'between' operator */
  value2?: string | number
}

export interface FilterTransformDef {
  type: 'filter'
  sourceTableId: string
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}


export interface SelectColumn {
  sourceColumnId: string
  newName?: string
  include: boolean
}

/** Select transform definition (column projection/renaming) */
export interface SelectTransformDef {
  type: 'select'
  sourceTableId: string
  columns: SelectColumn[]
}


export interface CalculatedColumnDef {
  type: 'calculated_column'
  sourceTableId: string
  newColumnName: string
  expression: string
}


export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'

export interface Aggregation {
  columnId: string
  operation: AggregationType
  alias: string
}

export interface GroupSummarizeDef {
  type: 'group_summarize'
  sourceTableId: string
  groupByColumns: string[]
  aggregations: Aggregation[]
}


export interface UnionTransformDef {
  type: 'union'
  sourceTableIds: string[]
}


/** View filter configuration (persisted per table) */
export interface ViewFilterConfig {
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}
