import type { 
  ProjectNode, 
  Edge, 
  Position, 
  TableSchema,
  CacheInfo,
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
  description: string
}

interface HistoryState {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export interface NodesSliceState {
  nodes: Record<string, ProjectNode>
  
  addNode: (node: ProjectNode) => void
  updateNode: (id: string, updates: Partial<ProjectNode>) => void
  duplicateNode: (id: string) => string | undefined
  deleteNode: (id: string) => void
  updateNodePosition: (id: string, position: Position) => void
  updateNodeUI: (id: string, updates: { viewMode?: NodeViewMode }) => void
  addNewTable: () => void
  addSourceTable: (params: {
    name: string
    fileRef: string
    fileName: string
    fileType: 'csv' | 'xlsx'
    sheetName?: string
    schema: TableSchema
    position?: Position
    initialRows?: Array<Record<string, CellValue>>
  }) => string
  addDerivedTable: (params: {
    name: string
    transformDef: import('@/types').TransformDef
    upstreamNodeIds: string[]
    schema?: TableSchema
    position?: Position
  }) => string
  addChart: (params: {
    name: string
    plan: ChartPlan
    position: Position
  }) => string
  updateTableSchema: (tableId: string, schema: TableSchema) => void
  addColumn: (tableId: string, columnName: string, columnType?: UserColumnType) => void
  insertColumnAt: (tableId: string, columnName: string, columnType: UserColumnType, index: number, formula?: string) => void
  addFormulaColumn: (tableId: string, columnName: string, formula: string, columnType: UserColumnType, index?: number) => void
  renameColumn: (tableId: string, columnId: string, newName: string) => void
  updateChartConfig: (chartId: string, updates: Partial<ChartConfig>) => void
  updateChartName: (chartId: string, name: string) => void
  setTableFilters: (tableId: string, filters: ViewFilterConfig | null) => void
  getTableFilters: (tableId: string) => ViewFilterConfig | undefined
  markNodeDirty: (nodeId: string) => void
  markNodeAndDescendantsDirty: (nodeId: string) => void
  updateCacheInfo: (nodeId: string, cacheInfo: Partial<CacheInfo>) => void
  clearNodeError: (nodeId: string) => void
  
  getNode: (id: string) => ProjectNode | undefined
  getTableNode: (id: string) => import('@/types').TableNode | undefined
  getUpstreamNodes: (nodeId: string) => ProjectNode[]
  getDownstreamNodes: (nodeId: string) => ProjectNode[]
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
  getPatches: (tableId: string) => Patches | undefined
  toggleCellHighlight: (tableId: string, rowId: string, columnId: string) => void
  clearHighlights: (tableId: string) => void
  setHighlights: (tableId: string, cells: string[]) => void
  isCellHighlighted: (tableId: string, rowId: string, columnId: string) => boolean
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
  saveSnapshot: (description: string) => void
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
