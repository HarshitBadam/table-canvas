import type { TableSchema } from './schema.types'
import type { TransformDef, AggregationType, ViewFilterConfig } from './transform.types'
import type { CellValue, Position } from './common.types'


export type ChartType = 'bar' | 'line' | 'pie' | 'scatter'

type NodeKind = 'source_table' | 'derived_table' | 'chart'

export type NodeViewMode = 'collapsed' | 'data'

export interface NodeUI {
  position: Position
  viewMode?: NodeViewMode
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
  lastPlanHash?: string
  lastUpstreamHash?: string
  currentVersionHash?: string
  lastRowCount?: number
  warnings?: string[]
  error?: string
  isComputing?: boolean
  dataRevision?: number
}


interface SourceTablePlan {
  fileRef: string
  fileName: string
  fileType: 'csv' | 'xlsx'
  sheetName?: string
  inferredSchemaVersion: number
  initialRows?: Array<Record<string, CellValue>>
}

export interface SourceTableNode extends BaseNode {
  kind: 'source_table'
  schema?: TableSchema
  plan: SourceTablePlan
  cacheInfo?: CacheInfo
  viewFilters?: ViewFilterConfig
}


interface DerivedTablePlan {
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
