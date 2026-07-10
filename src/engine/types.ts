import { 
  CellValue, 
  TableSchema, 
  ColumnProfile,
  ColumnSchema,
  AggregationType 
} from '@/types'


export type WorkerRequestType = 
  | 'init'
  | 'loadTable'
  | 'executeTransform'
  | 'getSlice'
  | 'getFilteredSlice'
  | 'getDistinctValues'
  | 'updateCell'
  | 'insertRow'
  | 'deleteRow'
  | 'getAggregation'
  | 'getProfile'
  | 'dropTable'

export interface WorkerRequest {
  id: string
  type: WorkerRequestType
  payload: unknown
}

export interface WorkerResponse {
  id: string
  success: boolean
  data?: unknown
  error?: string
}



export interface TableSlice {
  tableId: string
  offset: number
  limit: number
  rows: Record<string, CellValue>[]
  totalRows: number
}


export interface AggregationDef {
  groupBy?: string[]
  aggregations: {
    column: string
    operation: AggregationType
    alias?: string
  }[]
}

export interface AggregationResult {
  columns: string[]
  rows: CellValue[][]
}


export interface ProfileResult {
  tableId: string
  rowCount: number
  columns: ColumnProfile[]
  phase: 1 | 2
  computedAt: string
}


export interface TransformResult {
  tableId: string
  schema: TableSchema
  rowCount: number
  preview: Record<string, CellValue>[]
}


export interface LoadTableRequest {
  tableId: string
  data: {
    columns: string[]
    columnIds: string[]
    types: string[]
    rows: CellValue[][]
  }
}

export interface FilteredSliceRequest {
  tableId: string
  filters?: FilterConditionDef[]
  sorts?: SortDef[]
  search?: string
  offset: number
  limit: number
  /**
   * Client-side only: column schema used by EngineAdapter to remap returned rows
   * from DuckDB column names back to stable column ids. Stripped before the worker call.
   */
  columns?: ColumnSchema[]
}

export interface FilterConditionDef {
  column: string
  operator: string
  value?: CellValue
  value2?: CellValue
  columnType?: string
}

export interface SortDef {
  column: string
  direction: 'asc' | 'desc'
}

export interface UpdateCellRequest {
  tableId: string
  rowIndex: number
  column: string
  value: CellValue
  columnType?: string
}

export interface InsertRowRequest {
  tableId: string
  values: Record<string, CellValue>
  columns: string[]
  types: string[]
}

export interface DeleteRowRequest {
  tableId: string
  rowIndex: number
}

export interface DistinctValuesRequest {
  tableId: string
  column: string
  limit?: number
}

