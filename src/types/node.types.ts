import type { TableSchema } from './schema.types'
import type { TransformDef, AggregationType, ViewFilterConfig } from './transform.types'
import type { Position } from './common.types'


export type ChartType = 'bar' | 'line' | 'pie' | 'scatter'

/** Types of nodes in the project graph */
export type NodeKind = 'source_table' | 'derived_table' | 'chart' | 'dashboard'

export type NodeViewMode = 'collapsed' | 'data'

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


interface BaseNode {
  id: string
  kind: NodeKind
  name: string
  ui: NodeUI
  createdAt: string
  updatedAt: string
}


export interface CacheInfo {
  isDirty?: boolean
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
  lastRowCount?: number
  /** Warnings (e.g., "many-to-many join detected") */
  warnings?: string[]
  error?: string
  isComputing?: boolean
}


export interface SourceTablePlan {
  /** Reference to stored file in IndexedDB */
  fileRef: string
  fileName: string
  fileType: 'csv' | 'xlsx'
  sheetName?: string
  inferredSchemaVersion: number
}

export interface SourceTableNode extends BaseNode {
  kind: 'source_table'
  schema?: TableSchema
  plan: SourceTablePlan
  cacheInfo?: CacheInfo
  viewFilters?: ViewFilterConfig
}


export interface DerivedTablePlan {
  transformDef: TransformDef
  upstreamNodeIds: string[]
}

export interface DerivedTableNode extends BaseNode {
  kind: 'derived_table'
  schema?: TableSchema
  plan: DerivedTablePlan
  cacheInfo?: CacheInfo
  viewFilters?: ViewFilterConfig
}


export interface ChartConfig {
  xAxis?: string
  yAxis?: string
  series?: string[]
  aggregation?: AggregationType
  groupBy?: string
}

export interface ChartPlan {
  chartType: ChartType
  sourceTableId: string
  config: ChartConfig
}

export interface ChartNode extends BaseNode {
  kind: 'chart'
  plan: ChartPlan
}


export type TableNode = SourceTableNode | DerivedTableNode
export type ProjectNode = TableNode | ChartNode
