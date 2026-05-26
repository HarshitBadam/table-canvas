import type { TableSchema } from './schema.types'
import type { TransformDef, AggregationType, ViewFilterConfig } from './transform.types'
import type { Position } from './common.types'


/** Types of nodes in the project graph */
export type NodeKind = 'source_table' | 'derived_table' | 'chart' | 'dashboard'

/** View modes for table nodes on canvas */
export type NodeViewMode = 'collapsed' | 'data'


/** UI state for a node */
export interface NodeUI {
  position: Position
  collapsed?: boolean
  /** @deprecated Use viewMode instead */
  expanded?: boolean
  /** Three-state view: collapsed, stats (profile), or data preview */
  viewMode?: NodeViewMode
  width?: number
  height?: number
}


/** Base interface shared by all node types */
interface BaseNode {
  id: string
  kind: NodeKind
  name: string
  ui: NodeUI
  createdAt: string
  updatedAt: string
}


/** Cache state for computed nodes */
export interface CacheInfo {
  /** Indicates data needs recomputation */
  isDirty?: boolean
  /** Timestamp of last successful computation */
  lastComputedAt?: string
  /** Hash of the transform definition (for derived tables) */
  lastPlanHash?: string
  /** Combined hash of upstream table versions (for derived tables) */
  lastUpstreamHash?: string
  /**
   * This node's current computed version hash
   * For source tables: hash of fileRef + patches
   * For derived tables: hash of lastPlanHash + lastUpstreamHash
   */
  currentVersionHash?: string
  /** Row count from last computation */
  lastRowCount?: number
  /** Warnings (e.g., "many-to-many join detected") */
  warnings?: string[]
  /** Error from last computation attempt */
  error?: string
  /** Is computation currently in progress? */
  isComputing?: boolean
}


/** Plan for source table (imported file) */
export interface SourceTablePlan {
  /** Reference to stored file in IndexedDB */
  fileRef: string
  fileName: string
  fileType: 'csv' | 'xlsx'
  /** Sheet name for xlsx files */
  sheetName?: string
  inferredSchemaVersion: number
}

/** Source table node (imported from file) */
export interface SourceTableNode extends BaseNode {
  kind: 'source_table'
  schema?: TableSchema
  plan: SourceTablePlan
  cacheInfo?: CacheInfo
  viewFilters?: ViewFilterConfig
}


/** Plan for derived table (transform result) */
export interface DerivedTablePlan {
  transformDef: TransformDef
  upstreamNodeIds: string[]
}

/** Derived table node (result of a transform) */
export interface DerivedTableNode extends BaseNode {
  kind: 'derived_table'
  schema?: TableSchema
  plan: DerivedTablePlan
  cacheInfo?: CacheInfo
  viewFilters?: ViewFilterConfig
}


/** Chart configuration */
export interface ChartConfig {
  /** Column id for x-axis */
  xAxis?: string
  /** Column id for y-axis */
  yAxis?: string
  /** Column ids for series */
  series?: string[]
  aggregation?: AggregationType
  /** Column id for grouping */
  groupBy?: string
}

/** Plan for chart node */
export interface ChartPlan {
  chartType: 'bar' | 'line' | 'pie' | 'scatter'
  sourceTableId: string
  config: ChartConfig
}

/** Chart node */
export interface ChartNode extends BaseNode {
  kind: 'chart'
  plan: ChartPlan
}


/** Single card in a dashboard layout */
export interface DashboardCard {
  id: string
  /** Reference to chart or KPI node */
  nodeId: string
  x: number
  y: number
  width: number
  height: number
}

/** Dashboard layout configuration */
export interface DashboardLayout {
  cards: DashboardCard[]
}

/** Dashboard node */
export interface DashboardNode extends BaseNode {
  kind: 'dashboard'
  layout: DashboardLayout
}


/** Union of table node types */
export type TableNode = SourceTableNode | DerivedTableNode

/** Union of all project node types */
export type ProjectNode = TableNode | ChartNode | DashboardNode
