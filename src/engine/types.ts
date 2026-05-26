/**
 * Engine types for the data processing layer
 */

import { 
  CellValue, 
  TableSchema, 
  ColumnProfile,
  AggregationType 
} from '@/types'


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

