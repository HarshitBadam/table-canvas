/**
 * Engine types for the data processing layer
 */

import { 
  CellValue, 
  TableSchema, 
  ColumnProfile,
  AggregationType 
} from '@/lib/types'

// ============================================================================
// Engine Message Types (for Worker communication)
// ============================================================================

export type WorkerRequestType = 
  | 'init'
  | 'loadTable'
  | 'executeTransform'
  | 'getSlice'
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

// ============================================================================
// Table Data Types
// ============================================================================

export interface RawTableData {
  columns: string[]
  types: string[]
  rows: CellValue[][]
}

export interface TableSlice {
  tableId: string
  offset: number
  limit: number
  rows: Record<string, CellValue>[]
  totalRows: number
}

// ============================================================================
// Aggregation Types
// ============================================================================

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

// ============================================================================
// Profiling Types
// ============================================================================

export interface ProfileResult {
  tableId: string
  rowCount: number
  columns: ColumnProfile[]
  phase: 1 | 2
  computedAt: string
}

// ============================================================================
// Transform Result
// ============================================================================

export interface TransformResult {
  tableId: string
  schema: TableSchema
  rowCount: number
  preview: Record<string, CellValue>[]
}

// ============================================================================
// Load Table Request
// ============================================================================

export interface LoadTableRequest {
  tableId: string
  data: {
    columns: string[]
    columnIds: string[]
    types: string[]
    rows: CellValue[][]
  }
}

