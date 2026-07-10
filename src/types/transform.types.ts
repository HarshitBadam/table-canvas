type TransformType =
  | 'join'
  | 'filter'
  | 'select'
  | 'calculated_column'
  | 'group_summarize'
  | 'union'
  | 'reference'

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

interface JoinTransformDef {
  type: 'join'
  leftTableId: string
  rightTableId: string
  joinType: JoinType
  leftKey: string
  rightKey: string
  leftColumns?: string[]
  rightColumns?: string[]
  columnPrefix?: 'table_name' | 'left_right' | 'none'
  leftTableName?: string
  rightTableName?: string
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
  value2?: string | number
}

interface FilterTransformDef {
  type: 'filter'
  sourceTableId: string
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}


interface SelectColumn {
  sourceColumnId: string
  newName?: string
  include: boolean
}

interface SelectTransformDef {
  type: 'select'
  sourceTableId: string
  columns: SelectColumn[]
}


interface CalculatedColumnDef {
  type: 'calculated_column'
  sourceTableId: string
  newColumnName: string
  expression: string
}


export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'

interface Aggregation {
  columnId: string
  operation: AggregationType
  alias: string
}

interface GroupSummarizeDef {
  type: 'group_summarize'
  sourceTableId: string
  groupByColumns: string[]
  aggregations: Aggregation[]
}


interface UnionTransformDef {
  type: 'union'
  sourceTableIds: string[]
}


export interface ViewFilterConfig {
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}
