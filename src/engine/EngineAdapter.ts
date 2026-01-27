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
import type { TransformDef, CellValue, TableSchema, Patches } from '@/lib/types'
import EngineWorker from './worker/engine.worker?worker'

// Singleton instance
let engineInstance: EngineAdapter | null = null

export class EngineAdapter {
  private rpc: WorkerRPC
  private initialized = false

  private constructor() {
    // Create worker instance
    const worker = new EngineWorker()
    this.rpc = new WorkerRPC(worker)
  }

  /**
   * Get singleton instance
   */
  static getInstance(): EngineAdapter {
    if (!engineInstance) {
      engineInstance = new EngineAdapter()
    }
    return engineInstance
  }

  /**
   * Initialize the engine
   */
  async init(): Promise<void> {
    if (this.initialized) return
    
    await this.rpc.waitForReady()
    await this.rpc.call('init', {})
    this.initialized = true
  }

  /**
   * Load table data into the engine
   */
  async loadTable(
    tableId: string,
    schema: TableSchema,
    rows: Record<string, CellValue>[],
    patches?: Patches
  ): Promise<void> {
    await this.ensureInitialized()

    // Convert rows to array format
    const columns = schema.columns.map(c => c.name)
    const columnIds = schema.columns.map(c => c.id)
    const types = schema.columns.map(c => c.type)
    
    // Apply patches if any
    const processedRows = rows.map((row, rowIndex) => {
      const rowId = row.__rowId as string || `row_${rowIndex}`
      
      // Skip deleted rows
      if (patches?.deletedRows?.has(rowId)) {
        return null
      }
      
      return columnIds.map(colId => {
        // Check for patched value
        if (patches?.cellPatches?.[colId]?.[rowId] !== undefined) {
          return patches.cellPatches[colId][rowId]
        }
        return row[colId] ?? null
      })
    }).filter(row => row !== null) as CellValue[][]

    // Add inserted rows
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

  /**
   * Execute a transform and create a derived table
   * @param columnIdToName - Optional mapping from column IDs to human-readable names
   */
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

  /**
   * Get a slice of table data for display
   */
  async getSlice(tableId: string, offset: number, limit: number): Promise<TableSlice> {
    await this.ensureInitialized()
    
    return this.rpc.call<TableSlice>('getSlice', { tableId, offset, limit })
  }

  /**
   * Get aggregation results for charts
   */
  async getAggregation(tableId: string, aggDef: AggregationDef): Promise<AggregationResult> {
    await this.ensureInitialized()
    
    return this.rpc.call<AggregationResult>('getAggregation', { tableId, aggDef })
  }

  /**
   * Get profiling results for a table
   */
  async getProfile(tableId: string, phase: 1 | 2 = 1): Promise<ProfileResult> {
    await this.ensureInitialized()
    
    return this.rpc.call<ProfileResult>('getProfile', { tableId, phase })
  }

  /**
   * Drop a table from the engine
   */
  async dropTable(tableId: string): Promise<void> {
    await this.ensureInitialized()
    
    await this.rpc.call('dropTable', tableId)
  }

  /**
   * Ensure the engine is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }
}

// Export singleton getter
export const getEngine = () => EngineAdapter.getInstance()

