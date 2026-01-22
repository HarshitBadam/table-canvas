/**
 * Transform Type Definitions
 * 
 * Types for data transformations.
 */

import type { AggregationType } from './node.types';

// ============================================================================
// Transform Definition Union
// ============================================================================

export type TransformDef = 
  | JoinTransformDef 
  | FilterTransformDef 
  | SelectTransformDef 
  | CalculatedColumnDef
  | GroupSummarizeDef
  | UnionTransformDef;

// ============================================================================
// Join Transform
// ============================================================================

export type JoinType = 'left' | 'inner' | 'right' | 'full';

export interface JoinTransformDef {
  type: 'join';
  leftTableId: string;
  rightTableId: string;
  joinType: JoinType;
  leftKey: string;
  rightKey: string;
  leftColumns?: string[];
  rightColumns?: string[];
  columnPrefix?: 'table_name' | 'left_right' | 'none';
  leftTableName?: string;
  rightTableName?: string;
  // Legacy options
  keepLeftColumns?: string[];
  keepRightColumns?: string[];
}

// ============================================================================
// Filter Transform
// ============================================================================

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
  | 'is_not_null';

export interface FilterCondition {
  columnId: string;
  operator: FilterOperator;
  value?: string | number | boolean | null;
  value2?: string | number;
}

export interface FilterTransformDef {
  type: 'filter';
  sourceTableId: string;
  conditions: FilterCondition[];
  logic: 'and' | 'or';
}

// ============================================================================
// Select Transform
// ============================================================================

export interface SelectColumn {
  sourceColumnId: string;
  newName?: string;
  include: boolean;
}

export interface SelectTransformDef {
  type: 'select';
  sourceTableId: string;
  columns: SelectColumn[];
}

// ============================================================================
// Calculated Column Transform
// ============================================================================

export interface CalculatedColumnDef {
  type: 'calculated_column';
  sourceTableId: string;
  newColumnName: string;
  expression: string;
}

// ============================================================================
// Group Summarize Transform
// ============================================================================

export interface Aggregation {
  columnId: string;
  operation: AggregationType;
  alias: string;
}

export interface GroupSummarizeDef {
  type: 'group_summarize';
  sourceTableId: string;
  groupByColumns: string[];
  aggregations: Aggregation[];
}

// ============================================================================
// Union Transform
// ============================================================================

export interface UnionTransformDef {
  type: 'union';
  sourceTableIds: string[];
}
