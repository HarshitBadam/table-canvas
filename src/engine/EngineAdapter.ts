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
  FilteredSliceRequest,
} from './types'
import type { TransformDef, CellValue, TableSchema, Patches, ColumnSchema } from '@/types'
import EngineWorker from './worker/engine.worker?worker'

let engineInstance: EngineAdapter | null = null

/**
 * DuckDB stores columns under their human-readable display names (so transforms can
 * reference columns by name), but the rest of the app addresses cells by the stable
 * column `id`. Slice reads therefore come back keyed by name and must be remapped to
 * ids before any consumer (grid, report embeds, charts, export) can find their values.
 */
function remapRowsToColumnIds(
  rows: Record<string, CellValue>[],
  columns: ColumnSchema[],
): Record<string, CellValue>[] {
  const nameToId = new Map<string, string>()
  for (const col of columns) {
    nameToId.set(col.name, col.id)
    if (col.duckDbName) nameToId.set(col.duckDbName, col.id)
  }

  return rows.map((row) => {
    const remapped: Record<string, CellValue> = {}
    for (const key in row) {
      remapped[nameToId.get(key) ?? key] = row[key]
    }
    return remapped
  })
}

class EngineAdapter {
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

  async getSlice(
    tableId: string,
    offset: number,
    limit: number,
    columns?: ColumnSchema[],
  ): Promise<TableSlice> {
    await this.ensureInitialized()

    const slice = await this.rpc.call<TableSlice>('getSlice', { tableId, offset, limit })
    if (columns && columns.length > 0) {
      return { ...slice, rows: remapRowsToColumnIds(slice.rows, columns) }
    }
    return slice
  }

  async getFilteredSlice(request: FilteredSliceRequest): Promise<TableSlice> {
    await this.ensureInitialized()

    // `columns` is a client-side hint for name->id remapping and must not be sent to the worker.
    const { columns, ...workerRequest } = request
    const slice = await this.rpc.call<TableSlice>('getFilteredSlice', workerRequest)
    if (columns && columns.length > 0) {
      return { ...slice, rows: remapRowsToColumnIds(slice.rows, columns) }
    }
    return slice
  }

  async getDistinctValues(tableId: string, column: string, limit?: number): Promise<CellValue[]> {
    await this.ensureInitialized()
    return this.rpc.call<CellValue[]>('getDistinctValues', { tableId, column, limit })
  }

  async updateCell(tableId: string, rowIndex: number, column: string, value: CellValue, columnType?: string): Promise<void> {
    await this.ensureInitialized()
    await this.rpc.call('updateCell', { tableId, rowIndex, column, value, columnType })
  }

  async insertRow(tableId: string, values: Record<string, CellValue>, columns: string[], types: string[]): Promise<void> {
    await this.ensureInitialized()
    await this.rpc.call('insertRow', { tableId, values, columns, types })
  }

  async deleteRow(tableId: string, rowIndex: number): Promise<void> {
    await this.ensureInitialized()
    await this.rpc.call('deleteRow', { tableId, rowIndex })
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

