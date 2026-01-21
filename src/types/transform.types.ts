/**
 * Transform and edge types for data transformations
 */

// ============================================================================
// Edge Types
// ============================================================================

/** Types of transformations that can be applied */
export type TransformType = 
  | 'join' 
  | 'filter' 
  | 'select' 
  | 'calculated_column' 
  | 'group_summarize'
  | 'union'

/** Edge connecting two nodes with a transform */
export interface Edge {
  id: string
  fromNodeId: string
  toNodeId: string
  transformType: TransformType
}

// ============================================================================
// Transform Definitions
// ============================================================================

/** Union type of all transform definitions */
export type TransformDef = 
  | JoinTransformDef 
  | FilterTransformDef 
  | SelectTransformDef 
  | CalculatedColumnDef
  | GroupSummarizeDef
  | UnionTransformDef

/** Types of SQL joins */
export type JoinType = 'left' | 'inner' | 'right' | 'full'

/** Join transform definition */
export interface JoinTransformDef {
  type: 'join'
  leftTableId: string
  rightTableId: string
  joinType: JoinType
  /** Column id for left table join key */
  leftKey: string
  /** Column id for right table join key */
  rightKey: string
  /** Column IDs to include from left table (if omitted, include all) */
  leftColumns?: string[]
  /** Column IDs to include from right table (join key excluded by default) */
  rightColumns?: string[]
  /** Column naming strategy for disambiguation */
  columnPrefix?: 'table_name' | 'left_right' | 'none'
  /** Human-readable left table name for column prefixes */
  leftTableName?: string
  /** Human-readable right table name for column prefixes */
  rightTableName?: string
  /** @deprecated Legacy option - use leftColumns instead */
  keepLeftColumns?: string[]
  /** @deprecated Legacy option - use rightColumns instead */
  keepRightColumns?: string[]
}

// ============================================================================
// Filter Types
// ============================================================================

/** Filter comparison operators */
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

/** Single filter condition */
export interface FilterCondition {
  columnId: string
  operator: FilterOperator
  value?: string | number | boolean | null
  /** Second value for 'between' operator */
  value2?: string | number
}

/** Filter transform definition */
export interface FilterTransformDef {
  type: 'filter'
  sourceTableId: string
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}

// ============================================================================
// Select Transform
// ============================================================================

/** Column selection for select transform */
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

// ============================================================================
// Calculated Column
// ============================================================================

/** Calculated column transform definition */
export interface CalculatedColumnDef {
  type: 'calculated_column'
  sourceTableId: string
  newColumnName: string
  /** Expression string to be parsed */
  expression: string
}

// ============================================================================
// Group/Summarize Transform
// ============================================================================

/** Aggregation function types */
export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'

/** Single aggregation definition */
export interface Aggregation {
  columnId: string
  operation: AggregationType
  alias: string
}

/** Group and summarize transform definition */
export interface GroupSummarizeDef {
  type: 'group_summarize'
  sourceTableId: string
  groupByColumns: string[]
  aggregations: Aggregation[]
}

// ============================================================================
// Union Transform
// ============================================================================

/** Union transform definition */
export interface UnionTransformDef {
  type: 'union'
  sourceTableIds: string[]
}

// ============================================================================
// View Filter Configuration
// ============================================================================

/** View filter configuration (persisted per table) */
export interface ViewFilterConfig {
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}
