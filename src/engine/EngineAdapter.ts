/**
 * EngineAdapter - Interface for data operations
 * This adapter abstracts the DuckDB-WASM engine, allowing for future swaps
 */

import { WorkerRPC } from './worker/rpc'
import type {
  LoadTableRequest,
  TableSlice,
  AggregationDef,
  AggregationResult,
  ProfileResult,
  TransformResult,
} from './types'
import type { TransformDef, CellValue, TableSchema, Patches } from '@/types'
import EngineWorker from './worker/engine.worker?worker'

let engineInstance: EngineAdapter | null = null

export class EngineAdapter {
  private rpc: WorkerRPC
  private initialized = false

  private constructor() {
    const worker = new EngineWorker()
    this.rpc = new WorkerRPC(worker)
  }

  static getInstance(): EngineAdapter {
    if (!engineInstance) {
      engineInstance = new EngineAdapter()
    }
    return engineInstance
  }

  async init(): Promise<void> {
    if (this.initialized) return
    
    await this.rpc.waitForReady()
    await this.rpc.call('init', {})
    this.initialized = true
  }

  async loadTable(
    tableId: string,
    schema: TableSchema,
    rows: Record<string, CellValue>[],
    patches?: Patches
  ): Promise<void> {
    await this.ensureInitialized()

    const columns = schema.columns.map(c => c.name)
    const columnIds = schema.columns.map(c => c.id)
    const types = schema.columns.map(c => c.type)
    
    const processedRows = rows.map((row, rowIndex) => {
      const rowId = row.__rowId as string || `row_${rowIndex}`
      
      if (patches?.deletedRows?.has(rowId)) {
        return null
      }
      
      return columnIds.map(colId => {
        if (patches?.cellPatches?.[colId]?.[rowId] !== undefined) {
          return patches.cellPatches[colId][rowId]
        }
        return row[colId] ?? null
      })
    }).filter(row => row !== null) as CellValue[][]

    if (patches?.insertedRows) {
      for (const inserted of patches.insertedRows) {
        const rowValues = columnIds.map(colId => inserted.values[colId] ?? null)
        processedRows.push(rowValues)
      }
    }

    const request: LoadTableRequest = {
      tableId,
      data: {
        columns,
        columnIds,
        types,
        rows: processedRows,
      },
    }

    await this.rpc.call('loadTable', request)
  }

  async executeTransform(
    transformDef: TransformDef,
    outputTableId: string,
    columnIdToName?: Record<string, string>
  ): Promise<TransformResult> {
    await this.ensureInitialized()
    
    return this.rpc.call<TransformResult>('executeTransform', {
      ...transformDef,
      outputTableId,
      columnIdToName,
    })
  }

  async getSlice(tableId: string, offset: number, limit: number): Promise<TableSlice> {
    await this.ensureInitialized()
    
    return this.rpc.call<TableSlice>('getSlice', { tableId, offset, limit })
  }

  async getAggregation(tableId: string, aggDef: AggregationDef): Promise<AggregationResult> {
    await this.ensureInitialized()
    
    return this.rpc.call<AggregationResult>('getAggregation', { tableId, aggDef })
  }

  async getProfile(tableId: string, phase: 1 | 2 = 1): Promise<ProfileResult> {
    await this.ensureInitialized()
    
    return this.rpc.call<ProfileResult>('getProfile', { tableId, phase })
  }

  async dropTable(tableId: string): Promise<void> {
    await this.ensureInitialized()
    
    await this.rpc.call('dropTable', tableId)
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }
}

export const getEngine = () => EngineAdapter.getInstance()

