import type { 
  ProjectNode, 
  Edge, 
  Position, 
  TableSchema,
  NodeViewMode,
  ViewFilterConfig,
  ChartConfig,
  ChartPlan,
  Patches,
  CellValue,
  UserColumnType,
} from '@/types'

export interface HistoryEntry {
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  selectedNodeId: string | null
  description: string
}

interface HistoryTransaction {
  id: string
  projectId: string
  snapshot: HistoryEntry
}

export type ColumnOperationResult =
  | { ok: true; columnId: string }
  | {
      ok: false
      code:
        | 'TABLE_NOT_FOUND'
        | 'COLUMN_NOT_FOUND'
        | 'NOT_COMPUTED'
        | 'INVALID_NAME'
        | 'DUPLICATE_NAME'
        | 'INVALID_FORMULA'
        | 'CIRCULAR_DEPENDENCY'
        | 'COLUMN_IN_USE'
      error: string
    }

interface HistoryState {
  past: HistoryEntry[]
  future: HistoryEntry[]
  transaction?: HistoryTransaction | null
}

export interface NodesSliceState {
  nodes: Record<string, ProjectNode>

  addNode: (node: ProjectNode) => void
  updateNode: (id: string, updates: Partial<ProjectNode>) => void
  duplicateNode: (
    id: string,
    options?: { selectDuplicate?: boolean },
  ) => string | undefined
  deleteNode: (id: string, options?: { recordHistory?: boolean }) => void
  updateNodePosition: (id: string, position: Position) => void
  updateNodeUI: (id: string, updates: { viewMode?: NodeViewMode }) => void
  addSourceTable: (params: {
    name: string
    fileRef: string
    fileName: string
    fileType: 'csv' | 'xlsx' | 'snapshot'
    sheetName?: string
    schema: TableSchema
    position?: Position
    initialRows?: Array<Record<string, CellValue>>
    select?: boolean
    recordHistory?: boolean
  }) => string
  addDerivedTable: (params: {
    name: string
    transformDef: import('@/types').TransformDef
    upstreamNodeIds: string[]
    schema?: TableSchema
    position?: Position
    recordHistory?: boolean
  }) => string
  addChart: (params: {
    name: string
    plan: ChartPlan
    position: Position
  }) => string
  updateTableSchema: (tableId: string, schema: TableSchema) => void
  setMaterializedTableSchema: (tableId: string, schema: TableSchema) => void
  addColumn: (tableId: string, columnName: string, columnType?: UserColumnType) => ColumnOperationResult
  insertColumnAt: (tableId: string, columnName: string, columnType: UserColumnType, index: number, formula?: string) => ColumnOperationResult
  addFormulaColumn: (tableId: string, columnName: string, formula: string, columnType: UserColumnType, index?: number) => ColumnOperationResult
  updateFormulaColumn: (tableId: string, columnId: string, formula: string, columnType?: UserColumnType) => ColumnOperationResult
  removeFormulaColumn: (tableId: string, columnId: string) => ColumnOperationResult
  renameColumn: (tableId: string, columnId: string, newName: string) => ColumnOperationResult
  updateChartConfig: (chartId: string, updates: Partial<ChartConfig>) => void
  updateChartName: (chartId: string, name: string) => void
  setTableFilters: (tableId: string, filters: ViewFilterConfig | null) => void
  markNodeAndDescendantsDirty: (nodeId: string) => void
  touchNodeUpdatedAt: (nodeId: string) => void

  getTableNode: (id: string) => import('@/types').TableNode | undefined
  getUpstreamNodes: (nodeId: string) => ProjectNode[]
}

export interface EdgesSliceState {
  edges: Record<string, Edge>

  addEdge: (edge: Omit<Edge, 'id'>) => void
  deleteEdge: (id: string) => void
  wouldCreateCycle: (sourceId: string, targetId: string) => boolean
}

export interface PatchesSliceState {
  patches: Record<string, Patches>

  setCellValue: (tableId: string, rowId: string, columnId: string, value: CellValue) => void
  deleteRow: (tableId: string, rowId: string) => void
  insertRow: (tableId: string, rowId: string, values: Record<string, CellValue>, index: number) => void
  toggleCellHighlight: (tableId: string, rowId: string, columnId: string) => void
  clearHighlights: (tableId: string) => void
  setHighlights: (tableId: string, cells: string[]) => void
}

export interface SelectionSliceState {
  selectedNodeId: string | null

  selectNode: (id: string | null) => void
}

export interface HistorySliceState {
  history: HistoryState

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  saveSnapshot: (description: string) => string
  beginHistoryTransaction: (description: string) => string | null
  commitHistoryTransaction: (id: string) => boolean
  rollbackHistoryTransaction: (id: string) => boolean
}

export interface ProjectStoreState extends 
  NodesSliceState, 
  EdgesSliceState, 
  PatchesSliceState, 
  SelectionSliceState, 
  HistorySliceState {
  projectId: string
  projectName: string
}
