import {
  CellValue,
  TableSchema,
  ColumnProfile,
  ColumnSchema,
  AggregationType,
} from '@/types'

export type WorkerRequestType =
  | 'init'
  | 'loadTable'
  | 'executeTransform'
  | 'countCombinedTransformRows'
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

export interface WorkerMutationCancelRequest {
  type: 'cancelMutation'
  requestId: string
}

/**
 * Sent by the worker immediately before the single point that irrevocably
 * commits a mutation (the last statement of a transaction, or the sole
 * statement of an atomic single-statement mutation). The main thread's reply
 * is the sole, race-free authority on whether the commit may proceed: it is
 * decided synchronously against the same state used to fire the RPC timeout,
 * so the timeout and this handshake can never both "win" for the same request.
 */
export interface WorkerCommitDecisionRequest {
  type: 'prepareCommit'
  requestId: string
}

export interface WorkerCommitDecisionReply {
  type: 'commitDecision'
  requestId: string
  granted: boolean
}

export type WorkerMessage = WorkerRequest | WorkerMutationCancelRequest | WorkerCommitDecisionReply

export interface WorkerResponse {
  id: string
  success: boolean
  data?: unknown
  error?: string
}

export type WorkerReadyMessage = { type: 'ready' }

export type WorkerToMainMessage = WorkerResponse | WorkerReadyMessage | WorkerCommitDecisionRequest

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

