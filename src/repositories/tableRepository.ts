/**
 * Table Repository
 * 
 * Data access abstraction for table operations.
 * Provides a clean interface between the UI layer and data storage/engine.
 */

import type {
  TableSchema,
  Patches,
  CellValue,
  TableProfile,
} from '@/lib/types'

/**
 * Result of a table data load operation.
 */
export interface TableData {
  rows: Array<Record<string, CellValue>>
  schema: TableSchema
  rowCount: number
}

/**
 * Result of a materialization operation.
 */
export interface MaterializationResult {
  success: boolean
  schema?: TableSchema
  rowCount?: number
  error?: string
  duration?: number
}

/**
 * Options for loading table data.
 */
export interface LoadTableOptions {
  /** Starting row offset for pagination */
  offset?: number
  /** Maximum number of rows to load */
  limit?: number
  /** Apply patches to the loaded data */
  applyPatches?: boolean
}

/**
 * Options for saving patches.
 */
export interface SavePatchesOptions {
  /** Merge with existing patches */
  merge?: boolean
}

/**
 * Table Repository Interface
 * 
 * Defines the contract for table data operations.
 */
export interface ITableRepository {
  /**
   * Load table data.
   */
  loadTable(id: string, options?: LoadTableOptions): Promise<TableData>
  
  /**
   * Save cell edit patches.
   */
  savePatches(id: string, patches: Patches, options?: SavePatchesOptions): Promise<void>
  
  /**
   * Get patches for a table.
   */
  getPatches(id: string): Promise<Patches | undefined>
  
  /**
   * Clear all patches for a table.
   */
  clearPatches(id: string): Promise<void>
  
  /**
   * Materialize a derived table (execute its transform).
   */
  materialize(id: string): Promise<MaterializationResult>
  
  /**
   * Get table profile (statistics).
   */
  getProfile(id: string): Promise<TableProfile | undefined>
  
  /**
   * Execute an aggregation query.
   */
  aggregate(
    id: string,
    groupBy: string[],
    aggregations: Array<{ column: string; function: string; alias?: string }>
  ): Promise<TableData>
  
  /**
   * Execute a filter query.
   */
  filter(
    id: string,
    conditions: Array<{ column: string; operator: string; value: unknown }>
  ): Promise<TableData>
  
  /**
   * Check if a table exists.
   */
  exists(id: string): Promise<boolean>
  
  /**
   * Drop a table from the engine.
   */
  drop(id: string): Promise<void>
}

/**
 * Table Repository Implementation
 * 
 * Wraps the engine adapter and storage for data operations.
 */
export class TableRepository implements ITableRepository {
  private engine: EngineInterface
  private storage: StorageInterface
  
  constructor(engine: EngineInterface, storage: StorageInterface) {
    this.engine = engine
    this.storage = storage
  }
  
  async loadTable(id: string, options: LoadTableOptions = {}): Promise<TableData> {
    const { offset = 0, limit, applyPatches = true } = options
    
    // Load data from engine
    const result = await this.engine.getTableSlice(id, offset, limit)
    
    // Apply patches if requested
    if (applyPatches) {
      const patches = await this.getPatches(id)
      if (patches) {
        return this.applyPatchesToData(result, patches)
      }
    }
    
    return result
  }
  
  async savePatches(id: string, patches: Patches, options: SavePatchesOptions = {}): Promise<void> {
    const { merge = true } = options
    
    if (merge) {
      const existing = await this.getPatches(id)
      if (existing) {
        patches = this.mergePatches(existing, patches)
      }
    }
    
    await this.storage.setPatches(id, patches)
  }
  
  async getPatches(id: string): Promise<Patches | undefined> {
    return this.storage.getPatches(id)
  }
  
  async clearPatches(id: string): Promise<void> {
    await this.storage.clearPatches(id)
  }
  
  async materialize(id: string): Promise<MaterializationResult> {
    const startTime = Date.now()
    
    try {
      const result = await this.engine.materialize(id)
      return {
        success: true,
        schema: result.schema,
        rowCount: result.rowCount,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      }
    }
  }
  
  async getProfile(id: string): Promise<TableProfile | undefined> {
    return this.engine.getProfile(id)
  }
  
  async aggregate(
    id: string,
    groupBy: string[],
    aggregations: Array<{ column: string; function: string; alias?: string }>
  ): Promise<TableData> {
    return this.engine.aggregate(id, groupBy, aggregations)
  }
  
  async filter(
    id: string,
    conditions: Array<{ column: string; operator: string; value: unknown }>
  ): Promise<TableData> {
    return this.engine.filter(id, conditions)
  }
  
  async exists(id: string): Promise<boolean> {
    return this.engine.tableExists(id)
  }
  
  async drop(id: string): Promise<void> {
    await this.engine.dropTable(id)
  }
  
  // Private helpers
  
  private applyPatchesToData(data: TableData, patches: Patches): TableData {
    const rows = data.rows.map(row => {
      const rowId = row.__rowId as string
      
      // Skip deleted rows
      if (patches.deletedRows?.has(rowId)) {
        return null
      }
      
      // Apply cell patches
      const patchedRow = { ...row }
      if (patches.cellPatches) {
        for (const [colId, colPatches] of Object.entries(patches.cellPatches)) {
          if (colPatches[rowId] !== undefined) {
            patchedRow[colId] = colPatches[rowId]
          }
        }
      }
      
      return patchedRow
    }).filter((row): row is Record<string, CellValue> => row !== null)
    
    // Add inserted rows
    if (patches.insertedRows) {
      for (const inserted of patches.insertedRows) {
        rows.push({
          __rowId: inserted.rowId,
          ...inserted.values,
        })
      }
    }
    
    return {
      ...data,
      rows,
      rowCount: rows.length,
    }
  }
  
  private mergePatches(existing: Patches, incoming: Patches): Patches {
    const merged: Patches = {
      cellPatches: { ...existing.cellPatches },
      deletedRows: new Set([...(existing.deletedRows || []), ...(incoming.deletedRows || [])]),
      insertedRows: [...(existing.insertedRows || []), ...(incoming.insertedRows || [])],
      highlightedCells: new Set([...(existing.highlightedCells || []), ...(incoming.highlightedCells || [])]),
    }
    
    // Merge cell patches
    if (incoming.cellPatches) {
      for (const [colId, colPatches] of Object.entries(incoming.cellPatches)) {
        if (!merged.cellPatches[colId]) {
          merged.cellPatches[colId] = {}
        }
        Object.assign(merged.cellPatches[colId], colPatches)
      }
    }
    
    return merged
  }
}

// Interfaces for dependencies (to be injected)

interface EngineInterface {
  getTableSlice(id: string, offset: number, limit?: number): Promise<TableData>
  materialize(id: string): Promise<{ schema: TableSchema; rowCount: number }>
  getProfile(id: string): Promise<TableProfile | undefined>
  aggregate(
    id: string,
    groupBy: string[],
    aggregations: Array<{ column: string; function: string; alias?: string }>
  ): Promise<TableData>
  filter(
    id: string,
    conditions: Array<{ column: string; operator: string; value: unknown }>
  ): Promise<TableData>
  tableExists(id: string): Promise<boolean>
  dropTable(id: string): Promise<void>
}

interface StorageInterface {
  getPatches(id: string): Promise<Patches | undefined>
  setPatches(id: string, patches: Patches): Promise<void>
  clearPatches(id: string): Promise<void>
}

/**
 * Create a table repository with the default engine and storage.
 */
export async function createTableRepository(): Promise<ITableRepository> {
  // Import dynamically to avoid circular dependencies
  const { getEngine } = await import('@/engine')
  const engine = await getEngine()
  
  // Create a simple in-memory storage adapter
  const patchesStore = new Map<string, Patches>()
  const storage: StorageInterface = {
    async getPatches(id) {
      return patchesStore.get(id)
    },
    async setPatches(id, patches) {
      patchesStore.set(id, patches)
    },
    async clearPatches(id) {
      patchesStore.delete(id)
    },
  }
  
  // Wrap the engine adapter
  const engineWrapper: EngineInterface = {
    async getTableSlice(id, offset, limit) {
      const result = await engine.getSlice(id, offset, limit ?? 1000)
      return {
        rows: result.rows,
        schema: { columns: [], rowCount: result.totalRows },
        rowCount: result.totalRows,
      }
    },
    async materialize(_id) {
      // This would be implemented based on the actual engine API
      throw new Error('Not implemented')
    },
    async getProfile(id) {
      const result = await engine.getProfile(id)
      // Convert ProfileResult to TableProfile format
      return {
        rowCount: result.rowCount,
        columns: result.columns,
        computedAt: result.computedAt,
      }
    },
    async aggregate(id, groupBy, aggregations) {
      const aggDef = { 
        groupBy, 
        aggregations: aggregations.map(a => ({ 
          column: a.column, 
          operation: a.function as 'sum' | 'count' | 'avg' | 'min' | 'max', 
          alias: a.alias 
        })) 
      }
      const result = await engine.getAggregation(id, aggDef)
      // Convert rows from CellValue[][] to Record<string, CellValue>[]
      const rowRecords = result.rows.map(row => {
        const record: Record<string, CellValue> = {}
        result.columns.forEach((col, idx) => {
          record[col] = row[idx]
        })
        return record
      })
      return {
        rows: rowRecords,
        schema: { columns: [], rowCount: result.rows.length },
        rowCount: result.rows.length,
      }
    },
    async filter(_id, _conditions) {
      // This would be implemented based on the actual engine API
      throw new Error('Not implemented')
    },
    async tableExists(_id) {
      // This would be implemented based on the actual engine API
      return true
    },
    async dropTable(id) {
      await engine.dropTable(id)
    },
  }
  
  return new TableRepository(engineWrapper, storage)
}
