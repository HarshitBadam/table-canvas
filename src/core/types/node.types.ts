/**
 * Node Type Definitions
 * 
 * Types for project nodes (tables, charts, dashboards).
 */

import type { TableSchema, CellValue } from './schema.types';
import type { TransformDef, FilterCondition } from './transform.types';

// ============================================================================
// Base Node Types
// ============================================================================

export type NodeKind = 'source_table' | 'derived_table' | 'chart' | 'dashboard';

export interface Position {
  x: number;
  y: number;
}

export type NodeViewMode = 'collapsed' | 'stats' | 'data';

export interface NodeUI {
  position: Position;
  collapsed?: boolean;
  expanded?: boolean;
  viewMode?: NodeViewMode;
  width?: number;
  height?: number;
}

interface BaseNode {
  id: string;
  kind: NodeKind;
  name: string;
  ui: NodeUI;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Cache Info
// ============================================================================

export interface CacheInfo {
  isDirty?: boolean;
  lastComputedAt?: string;
  lastPlanHash?: string;
  lastUpstreamHash?: string;
  currentVersionHash?: string;
  lastRowCount?: number;
  warnings?: string[];
  error?: string;
  isComputing?: boolean;
}

// ============================================================================
// View Filter Configuration
// ============================================================================

export interface ViewFilterConfig {
  conditions: FilterCondition[];
  logic: 'and' | 'or';
}

// ============================================================================
// Source Table Node
// ============================================================================

export interface SourceTablePlan {
  fileRef: string;
  fileName: string;
  fileType: 'csv' | 'xlsx';
  sheetName?: string;
  inferredSchemaVersion: number;
}

export interface SourceTableNode extends BaseNode {
  kind: 'source_table';
  schema?: TableSchema;
  plan: SourceTablePlan;
  cacheInfo?: CacheInfo;
  viewFilters?: ViewFilterConfig;
}

// ============================================================================
// Derived Table Node
// ============================================================================

export interface DerivedTablePlan {
  transformDef: TransformDef;
  upstreamNodeIds: string[];
}

export interface DerivedTableNode extends BaseNode {
  kind: 'derived_table';
  schema?: TableSchema;
  plan: DerivedTablePlan;
  cacheInfo?: CacheInfo;
  viewFilters?: ViewFilterConfig;
}

// ============================================================================
// Chart Node
// ============================================================================

export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';

export interface ChartConfig {
  xAxis?: string;
  yAxis?: string;
  series?: string[];
  aggregation?: AggregationType;
  groupBy?: string;
}

export interface ChartPlan {
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  sourceTableId: string;
  config: ChartConfig;
}

export interface ChartNode extends BaseNode {
  kind: 'chart';
  plan: ChartPlan;
}

// ============================================================================
// Dashboard Node
// ============================================================================

export interface DashboardCard {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DashboardLayout {
  cards: DashboardCard[];
}

export interface DashboardNode extends BaseNode {
  kind: 'dashboard';
  layout: DashboardLayout;
}

// ============================================================================
// Composite Types
// ============================================================================

export type TableNode = SourceTableNode | DerivedTableNode;
export type ProjectNode = TableNode | ChartNode | DashboardNode;

// ============================================================================
// Edge Type
// ============================================================================

export type TransformType = 
  | 'join' 
  | 'filter' 
  | 'select' 
  | 'calculated_column' 
  | 'group_summarize'
  | 'union';

export interface Edge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  transformType: TransformType;
}

// ============================================================================
// Patches (for source table editing)
// ============================================================================

export interface InsertedRow {
  rowId: string;
  values: Record<string, CellValue>;
  insertedAt: number;
}

export interface Patches {
  cellPatches: Record<string, Record<string, CellValue>>;
  deletedRows: Set<string>;
  insertedRows: InsertedRow[];
  highlightedCells?: Set<string>;
}

// ============================================================================
// Project State
// ============================================================================

export interface ProjectState {
  id: string;
  name: string;
  nodes: Record<string, ProjectNode>;
  edges: Record<string, Edge>;
  createdAt: string;
  updatedAt: string;
}
