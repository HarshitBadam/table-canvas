// Core type definitions for Table Canvas

// ============================================================================
// Schema Types
// ============================================================================

export type ColumnType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'datetime' 
  | 'unknown'

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
  // Formula column support
  formula?: string           // e.g., "[unit_price] * [quantity]"
  isComputed?: boolean       // Flag for virtual/computed columns
}

export interface TableSchema {
  columns: ColumnSchema[]
  rowCount?: number
}

// ============================================================================
// Node Types
// ============================================================================

export type NodeKind = 'source_table' | 'derived_table' | 'chart' | 'dashboard'

export interface Position {
  x: number
  y: number
}

export type NodeViewMode = 'collapsed' | 'stats' | 'data'

export interface NodeUI {
  position: Position
  collapsed?: boolean
  expanded?: boolean // For showing detailed stats on canvas (legacy, use viewMode)
  viewMode?: NodeViewMode // Three-state view: collapsed, stats (profile), or data preview
  width?: number
  height?: number
}

// Base node interface
interface BaseNode {
  id: string
  kind: NodeKind
  name: string
  ui: NodeUI
  createdAt: string
  updatedAt: string
}

// Source table specific fields
export interface SourceTablePlan {
  fileRef: string // Reference to stored file in IndexedDB
  fileName: string
  fileType: 'csv' | 'xlsx'
  sheetName?: string // For xlsx files
  inferredSchemaVersion: number
}

// Derived table specific fields
export interface DerivedTablePlan {
  transformDef: TransformDef
  upstreamNodeIds: string[]
}

// Chart specific fields
export interface ChartPlan {
  chartType: 'bar' | 'line' | 'pie' | 'scatter'
  sourceTableId: string
  config: ChartConfig
}

export interface ChartConfig {
  xAxis?: string // Column id
  yAxis?: string // Column id
  series?: string[] // Column ids
  aggregation?: AggregationType
  groupBy?: string // Column id
}

export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'

// Cache info for nodes
export interface CacheInfo {
  // Dirty state - indicates data needs recomputation
  isDirty?: boolean
  
  // Timestamp of last successful computation
  lastComputedAt?: string
  
  // Hash of the transform definition (for derived tables)
  lastPlanHash?: string
  
  // Combined hash of upstream table versions (for derived tables)
  lastUpstreamHash?: string
  
  // This node's current computed version hash
  // For source tables: hash of fileRef + patches
  // For derived tables: hash of lastPlanHash + lastUpstreamHash
  currentVersionHash?: string
  
  // Row count from last computation
  lastRowCount?: number
  
  // Warnings (e.g., "many-to-many join detected")
  warnings?: string[]
  
  // Error from last computation attempt
  error?: string
  
  // Is computation currently in progress?
  isComputing?: boolean
}

// View filter configuration (persisted per table)
export interface ViewFilterConfig {
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}

// Full node types
export interface SourceTableNode extends BaseNode {
  kind: 'source_table'
  schema?: TableSchema
  plan: SourceTablePlan
  cacheInfo?: CacheInfo
  viewFilters?: ViewFilterConfig
}

export interface DerivedTableNode extends BaseNode {
  kind: 'derived_table'
  schema?: TableSchema
  plan: DerivedTablePlan
  cacheInfo?: CacheInfo
  viewFilters?: ViewFilterConfig
}

export interface ChartNode extends BaseNode {
  kind: 'chart'
  plan: ChartPlan
}

export interface DashboardNode extends BaseNode {
  kind: 'dashboard'
  layout: DashboardLayout
}

export interface DashboardLayout {
  cards: DashboardCard[]
}

export interface DashboardCard {
  id: string
  nodeId: string // Reference to chart or KPI
  x: number
  y: number
  width: number
  height: number
}

export type TableNode = SourceTableNode | DerivedTableNode
export type ProjectNode = TableNode | ChartNode | DashboardNode

// ============================================================================
// Edge Types
// ============================================================================

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

// ============================================================================
// Transform Definitions
// ============================================================================

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
  leftKey: string // Column id
  rightKey: string // Column id
  // Column selection - if omitted, include all columns
  leftColumns?: string[]   // Column IDs to include from left table
  rightColumns?: string[]  // Column IDs to include from right table (join key excluded by default)
  // Column naming strategy for disambiguation
  columnPrefix?: 'table_name' | 'left_right' | 'none'
  // Human-readable table names for better column prefixes
  leftTableName?: string
  rightTableName?: string
  // Legacy options (kept for backwards compatibility)
  keepLeftColumns?: string[]
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
  value2?: string | number // For 'between' operator
}

export interface FilterTransformDef {
  type: 'filter'
  sourceTableId: string
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}

export interface SelectTransformDef {
  type: 'select'
  sourceTableId: string
  columns: SelectColumn[]
}

export interface SelectColumn {
  sourceColumnId: string
  newName?: string
  include: boolean
}

export interface CalculatedColumnDef {
  type: 'calculated_column'
  sourceTableId: string
  newColumnName: string
  expression: string // Expression string to be parsed
}

export interface GroupSummarizeDef {
  type: 'group_summarize'
  sourceTableId: string
  groupByColumns: string[]
  aggregations: Aggregation[]
}

export interface Aggregation {
  columnId: string
  operation: AggregationType
  alias: string
}

export interface UnionTransformDef {
  type: 'union'
  sourceTableIds: string[]
}

// ============================================================================
// Edit Patches (for source table editing)
// ============================================================================

export type CellValue = string | number | boolean | null

export interface Patches {
  cellPatches: Record<string, Record<string, CellValue>> // columnId -> rowId -> value
  deletedRows: Set<string>
  insertedRows: InsertedRow[]
  highlightedCells?: Set<string> // "rowId:columnId" format for manual cell highlighting
}

export interface InsertedRow {
  rowId: string
  values: Record<string, CellValue> // columnId -> value
  insertedAt: number // Index where row was inserted
}

// ============================================================================
// Profiling Results
// ============================================================================

export type CardinalityClass = 'unique' | 'high' | 'low'

// Column classification for intelligent suggestion generation
export type ColumnClassification = 
  | 'unique_identifier'      // >95% unique, sequential pattern, or ID-like name
  | 'continuous_numeric'     // Numbers with variance, suitable for histograms
  | 'discrete_numeric'       // Numbers with few distinct values (counts, ratings)
  | 'low_cardinality_cat'    // String with <20 distinct values - good for pie/bar
  | 'high_cardinality_cat'   // String with 20-95% unique - needs Top N treatment  
  | 'temporal'               // Date/datetime - suitable for time series
  | 'text'                   // Free-form text - not suitable for charts

export interface ColumnProfile {
  columnId: string
  missingCount: number
  missingPercent: number
  distinctCount: number
  distinctCountExact?: boolean
  topValues?: Array<{ value: CellValue; count: number }>
  // Numeric stats
  min?: number
  max?: number
  mean?: number
  median?: number
  stdDev?: number  // Standard deviation
  q1?: number      // 25th percentile
  q3?: number      // 75th percentile
  iqr?: number     // Interquartile range (q3 - q1)
  histogram?: Array<{ bucket: string; count: number }>
  // String stats
  minLength?: number
  maxLength?: number
  avgLength?: number
  // Enhanced profile fields
  completeness: number  // 100 - missingPercent
  cardinalityClass?: CardinalityClass  // Based on distinctCount/rowCount ratio
  semanticHints?: SemanticHint[]  // Detected patterns (email, URL, phone, etc.)
  isKeyCandidate?: boolean  // High uniqueness, low nulls
}

export interface TableProfile {
  tableId: string
  rowCount: number
  columns: ColumnProfile[]
  keyCandidate?: string[] // Columns that could be primary key
  computedAt: string
  phase: 1 | 2
}

// ============================================================================
// Suggestion Types
// ============================================================================

export type SuggestionCategory = 'cleaning' | 'analysis' | 'recipe'
export type SuggestionScope = 'table' | 'column'
export type SuggestionConfidence = 'high' | 'medium' | 'low'

// Preview data types for lazy loading
export type PreviewData =
  | { kind: 'beforeAfter'; rows: Array<{ before: CellValue; after: CellValue }> }
  | { kind: 'tableSample'; columns: string[]; rows: CellValue[][] }
  | { kind: 'aggregateSample'; columns: string[]; rows: CellValue[][] }
  | { kind: 'recipeOutputs'; outputs: Array<{ type: 'table' | 'chart'; name: string }> }

export interface SuggestionPreview {
  status: 'not_loaded' | 'loading' | 'ready' | 'error'
  data?: PreviewData
  error?: string
}

export interface SuggestionContext {
  tableId: string
  columnId?: string
  tableVersionHash: string
  // Cleaning operation details (used by ApplyPatchCommand to generate SQL)
  cleaningOperation?: CleaningOperation
}

// Cleaning operation types for suggestion execution
export type CleaningOperation =
  | { type: 'trim' }
  | { type: 'lowercase' }
  | { type: 'uppercase' }
  | { type: 'titlecase' }
  | { type: 'replace_typos'; mappings: Record<string, string> }
  | { type: 'normalize_case'; mappings: Record<string, string> }
  | { type: 'nullify_placeholders'; placeholders: string[] }
  | { type: 'standardize_date'; outputFormat: string }
  | { type: 'epoch_to_date'; unit: 'seconds' | 'milliseconds' }
  | { type: 'fill_missing_numeric'; strategy: 'mean' | 'median' | 'zero' }
  | { type: 'fill_missing_string'; value: string }
  | { type: 'remove_outliers'; lowerBound: number; upperBound: number }
  | { type: 'highlight_outliers'; lowerBound: number; upperBound: number }

export interface SuggestionImpact {
  kind: 'patch' | 'derivedTable' | 'chart' | 'recipe'
  summary: string
}

export interface Suggestion {
  id: string
  category: SuggestionCategory
  scope: SuggestionScope
  title: string
  description?: string
  confidence: SuggestionConfidence
  context: SuggestionContext
  why?: string[]
  impact?: SuggestionImpact
  preview?: SuggestionPreview
  action: SuggestionAction
}

// Action types - deterministic and executable
export type SuggestionAction =
  | { 
      kind: 'applyPatch'
      ops: PatchOp[]
      target: 'source' | 'cleanCopy'
    }
  | { 
      kind: 'createDerivedTable'
      transform: TransformDef
      tableName?: string
      openAfterApply?: boolean 
    }
  | { 
      kind: 'createChart'
      chart: ChartDef
      addToDashboard?: boolean 
    }
  | { 
      kind: 'launchRecipe'
      recipeId: string
      initialBindings?: Record<string, unknown>
    }
  | {
      kind: 'highlightCells'
      cells: string[] // "rowId:columnId" format
      target: 'source'
    }

// Patch operation for cell-level changes
export interface PatchOp {
  rowId: string
  columnId: string
  oldValue: CellValue
  newValue: CellValue
}

// Chart definition for creating charts from suggestions
export interface ChartDef {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram'
  sourceTableId: string
  title?: string
  config: ChartConfig
}

// Legacy action types (for backward compatibility during migration)
export type LegacySuggestionAction = 
  | { type: 'create_derived_table'; transform: TransformDef }
  | { type: 'create_chart'; chartConfig: ChartConfig; sourceTableId: string }
  | { type: 'apply_cleaning'; columnId: string; operation: string }

// ============================================================================
// Project State
// ============================================================================

export interface ProjectState {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  createdAt: string
  updatedAt: string
}

