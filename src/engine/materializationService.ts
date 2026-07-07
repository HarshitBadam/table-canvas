/**
 * Materialization Service
 * 
 * Orchestrates the computation of derived tables by:
 * 1. Checking if a table needs recomputation (dirty state)
 * 2. Ensuring all upstream dependencies are materialized
 * 3. Executing transforms and caching results
 * 4. Managing computation state and errors
 */

import { getEngine } from './EngineAdapter'
import { getComputationOrder } from './dependencyGraph'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { loadFileWithSync } from '@/persistence/syncService'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { 
  SourceTableNode, 
  DerivedTableNode,
  CellValue,
  TableSchema,
  ColumnSchema,
} from '@/lib/types'

// ============================================================================
// Types
// ============================================================================

export type MaterializationStatus = 
  | 'cached'      // Data is up-to-date in cache
  | 'computed'    // Data was just computed
  | 'loading'     // Currently loading/computing
  | 'error'       // Computation failed

export interface MaterializationResult {
  status: MaterializationStatus
  tableId: string
  rowCount?: number
  schema?: TableSchema
  error?: string
}

// Track in-progress materializations to prevent duplicate work
const inProgressMaterializations = new Map<string, Promise<MaterializationResult>>()

// Simple mutex for sequential execution to avoid race conditions
let materializationQueue = Promise.resolve()

// ============================================================================
// Version Hash Computation
// ============================================================================

/**
 * Compute a simple hash string for cache invalidation.
 * This is a fast, non-cryptographic hash for comparison purposes.
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

/**
 * Compute version hash for a source table based on file ref and patches.
 */
function computeSourceVersionHash(
  tableId: string,
  fileRef: string,
  patchVersion: string
): string {
  return simpleHash(`source:${tableId}:${fileRef}:${patchVersion}`)
}

/**
 * Compute version hash for a derived table based on transform def and upstream hashes.
 */
function computeDerivedVersionHash(
  tableId: string,
  transformDefJson: string,
  upstreamHashes: string[]
): string {
  const upstreamHashStr = upstreamHashes.sort().join(':')
  return simpleHash(`derived:${tableId}:${transformDefJson}:${upstreamHashStr}`)
}

// ============================================================================
// Engine State Helpers
// ============================================================================

/**
 * Check if a table exists in DuckDB.
 * This is important because DuckDB state is lost on page refresh.
 */
async function tableExistsInEngine(tableId: string): Promise<boolean> {
  try {
    const engine = getEngine()
    // Try to get a slice - if table doesn't exist, this will throw
    await engine.getSlice(tableId, 0, 1)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Source Table Loading
// ============================================================================

/**
 * Load a source table from IndexedDB and apply patches.
 */
async function loadSourceTable(tableId: string): Promise<MaterializationResult> {
  const projectStore = useProjectStore.getState()
  const dataStore = useDataStore.getState()
  const node = projectStore.getTableNode(tableId) as SourceTableNode | undefined
  
  if (!node || node.kind !== 'source_table') {
    return {
      status: 'error',
      tableId,
      error: 'Source table not found',
    }
  }
  
  // Mark as computing
  projectStore.updateCacheInfo(tableId, { isComputing: true, error: undefined })
  
  try {
    const engine = getEngine()
    await engine.init()
    
    // Check if we already have data in the dataStore
    const existingData = dataStore.tableData[tableId]
    const patches = projectStore.patches[tableId]
    
    // Compute patch version for cache comparison
    const patchVersion = patches 
      ? `${patches.insertedRows?.length || 0}-${Object.keys(patches.cellPatches || {}).length}-${patches.deletedRows?.size || 0}`
      : '0-0-0'
    
    const currentVersionHash = computeSourceVersionHash(
      tableId,
      node.plan.fileRef,
      patchVersion
    )
    
    // Check if table exists in DuckDB (gets reset on page refresh)
    const existsInEngine = await tableExistsInEngine(tableId)
    
    // Check if cache is still valid AND table exists in engine
    if (
      existsInEngine &&
      existingData && 
      existingData.rows?.length > 0 &&
      !existingData.isLoading && 
      node.cacheInfo?.currentVersionHash === currentVersionHash &&
      !node.cacheInfo?.isDirty
    ) {
      projectStore.updateCacheInfo(tableId, { isComputing: false })
      return {
        status: 'cached',
        tableId,
        rowCount: existingData.rows.length,
      }
    }
    
    // Load data from local cache or backend
    let rows: TableRow[] = []
    
    if (node.plan.fileRef) {
      const fileData = await loadFileWithSync(node.plan.fileRef)
      if (fileData) {
        // Parse file data into id-keyed rows (convertToTableRows assigns __rowId
        // and maps every file header to the correct schema column id).
        rows = await parseFileData(fileData, node.plan.fileType, node.plan.sheetName, node.schema)

        // The data store is the single source of truth and is always id-keyed.
        dataStore.setTableData(tableId, rows)
      } else {
        // File not in IndexedDB - user needs to re-import the data
        projectStore.updateCacheInfo(tableId, {
          isComputing: false,
          error: 'Data file not found. Please re-import the file.',
        })
        
        return {
          status: 'error',
          tableId,
          error: 'Data file not found. Please re-import the file.',
        }
      }
    } else {
      // No file - this is a manually created table
      // Preserve existing data from dataStore (if any), don't overwrite
      rows = existingData?.rows ?? []
      if (!existingData?.rows) {
        // Only set if no existing data
        dataStore.setTableData(tableId, rows)
      }
    }
    
    // Load into engine (applies patches internally)
    if (node.schema) {
      await engine.loadTable(tableId, node.schema, rows as Record<string, CellValue>[], patches)
    }
    
    // Update cache info
    projectStore.updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      currentVersionHash,
      lastRowCount: rows.length,
      error: undefined,
    })
    
    return {
      status: 'computed',
      tableId,
      rowCount: rows.length,
      schema: node.schema,
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    projectStore.updateCacheInfo(tableId, {
      isComputing: false,
      error: errorMessage,
    })
    
    return {
      status: 'error',
      tableId,
      error: errorMessage,
    }
  }
}

/**
 * Parse file data based on file type.
 */
async function parseFileData(
  fileData: ArrayBuffer,
  fileType: 'csv' | 'xlsx',
  sheetName?: string,
  schema?: TableSchema
): Promise<TableRow[]> {
  if (fileType === 'csv') {
    return parseCSVData(fileData, schema)
  } else if (fileType === 'xlsx') {
    return parseExcelData(fileData, sheetName, schema)
  }
  
  return []
}

/**
 * Parse CSV data from ArrayBuffer
 */
export function parseCSVData(fileData: ArrayBuffer, schema?: TableSchema): Promise<TableRow[]> {
  return new Promise((resolve) => {
    const decoder = new TextDecoder('utf-8')
    const text = decoder.decode(fileData)
    
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = convertToTableRows(results.data, results.meta.fields || [], schema)
        resolve(rows)
      },
      error: () => {
        resolve([])
      },
    })
  })
}

/**
 * Parse Excel data from ArrayBuffer
 */
export function parseExcelData(fileData: ArrayBuffer, sheetName?: string, schema?: TableSchema): Promise<TableRow[]> {
  return new Promise((resolve) => {
    try {
      const wb = XLSX.read(fileData, { type: 'array' })
      const targetSheet = sheetName || wb.SheetNames[0]
      const sheet = wb.Sheets[targetSheet]
      
      if (!sheet) {
        resolve([])
        return
      }
      
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
      
      if (data.length === 0) {
        resolve([])
        return
      }
      
      const headerRow = data[0] as unknown[]
      const headers = headerRow.map((h, i) => String(h || `Column ${i + 1}`))
      
      const dataRows = data.slice(1).map((row) => {
        const rowArr = row as unknown[]
        const obj: Record<string, string> = {}
        headers.forEach((header, i) => {
          obj[header] = String(rowArr[i] ?? '')
        })
        return obj
      })
      
      const rows = convertToTableRows(dataRows, headers, schema)
      resolve(rows)
    } catch (error) {
      console.error('[MaterializationService] Excel parsing error:', error)
      resolve([])
    }
  })
}

/**
 * Map each parsed file field (header) to the schema column id it belongs to.
 *
 * The data store is ALWAYS keyed by column `id`, so parsing must resolve every
 * file header to the correct column id. Resolution priority:
 *   1. Exact name match against a schema column name (the common case).
 *   2. Positional match: the i-th file field maps to the i-th schema column.
 *      This keeps rows correctly keyed even after a column was renamed in the
 *      grid (the underlying file still has the original header).
 *   3. Schema-less import: derive a stable id from the field name/index.
 */
function buildFieldToColumnId(
  fields: string[],
  schema?: TableSchema
): Map<string, string> {
  const fieldToColId = new Map<string, string>()
  const columns = schema?.columns ?? []
  const columnsByName = new Map<string, ColumnSchema>()
  columns.forEach((col) => columnsByName.set(col.name, col))

  const usedColumnIds = new Set<string>()

  fields.forEach((field, index) => {
    let colId: string

    const byName = columnsByName.get(field)
    const byPosition = columns[index]

    if (byName && !usedColumnIds.has(byName.id)) {
      colId = byName.id
    } else if (byPosition && !usedColumnIds.has(byPosition.id)) {
      // Renamed column: header no longer matches, but position still lines up.
      colId = byPosition.id
    } else if (schema) {
      // Schema present but no column left to map this field to (e.g. a column
      // that was removed from the schema). Fall back to the raw field name so
      // the value is preserved but simply ignored by id-keyed consumers.
      colId = field
    } else {
      colId = `col_${index}_${field.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    }

    usedColumnIds.add(colId)
    fieldToColId.set(field, colId)
  })

  return fieldToColId
}

/**
 * Coerce a raw string cell value to the type declared by its column schema.
 */
function coerceValue(value: CellValue, colSchema?: ColumnSchema): CellValue {
  if (value === undefined) return null

  if (colSchema?.type === 'number' && value !== '' && value !== null) {
    const num = parseFloat(String(value).replace(/,/g, ''))
    return isNaN(num) ? value : num
  }

  if (colSchema?.type === 'boolean') {
    const lower = String(value).toLowerCase()
    if (lower === 'true' || lower === '1' || lower === 'yes') return true
    if (lower === 'false' || lower === '0' || lower === 'no') return false
  }

  return value
}

/**
 * Convert parsed file data to TableRow format keyed by column id.
 *
 * This is the single entry point that turns parser output (keyed by file
 * header) into the id-keyed rows that the data store, grid, canvas and export
 * all consume. Exported for unit testing of the key mapping.
 */
export function convertToTableRows(
  data: Record<string, string>[],
  fields: string[],
  schema?: TableSchema
): TableRow[] {
  const fieldToColId = buildFieldToColumnId(fields, schema)

  const columnById = new Map<string, ColumnSchema>()
  schema?.columns.forEach((c) => columnById.set(c.id, c))

  return data.map((row, index) => {
    const rowData: TableRow = { __rowId: `row_${index}` }

    fields.forEach((field) => {
      const colId = fieldToColId.get(field) as string
      rowData[colId] = coerceValue(row[field], columnById.get(colId))
    })

    return rowData
  })
}

/**
 * Re-key rows produced by the DuckDB engine into the id-keyed shape used by the
 * data store and every downstream consumer (grid, canvas, report, export).
 *
 * The DuckDB table for both source and derived tables is created using the
 * column *name* (see EngineAdapter.loadTable and the transform SQL aliases), so
 * `col.name` is the authoritative engine key. `duckDbName` and `id` are kept as
 * fallbacks purely for resilience against older/edited schemas.
 *
 * This is the ONE place engine output crosses into the id-keyed world, so the
 * whole pipeline stays consistent end-to-end. Exported for unit testing.
 */
export function keyRowsById(
  engineRows: Record<string, CellValue>[],
  schema: TableSchema,
  rowIdPrefix = 'row'
): TableRow[] {
  return engineRows.map((row, idx) => {
    const existingRowId = row.__rowId
    const out: TableRow = {
      __rowId: typeof existingRowId === 'string' && existingRowId
        ? existingRowId
        : `${rowIdPrefix}_${idx}`,
    }

    for (const col of schema.columns) {
      const value =
        row[col.name] ??
        (col.duckDbName ? row[col.duckDbName] : undefined) ??
        row[col.id]
      out[col.id] = value ?? null
    }

    return out
  })
}

// ============================================================================
// Derived Table Computation
// ============================================================================

/**
 * Compute a derived table by executing its transform.
 */
async function computeDerivedTable(tableId: string): Promise<MaterializationResult> {
  const projectStore = useProjectStore.getState()
  const dataStore = useDataStore.getState()
  const node = projectStore.getTableNode(tableId) as DerivedTableNode | undefined
  
  if (!node || node.kind !== 'derived_table') {
    return {
      status: 'error',
      tableId,
      error: 'Derived table not found',
    }
  }
  
  // Mark as computing
  projectStore.updateCacheInfo(tableId, { isComputing: true, error: undefined })
  
  try {
    const engine = getEngine()
    await engine.init()
    
    // Get upstream version hashes for cache validation
    const upstreamHashes: string[] = []
    for (const upstreamId of node.plan.upstreamNodeIds) {
      const upstreamNode = projectStore.getTableNode(upstreamId)
      if (upstreamNode?.cacheInfo?.currentVersionHash) {
        upstreamHashes.push(upstreamNode.cacheInfo.currentVersionHash)
      }
    }
    
    // Compute current version hash
    const transformDefJson = JSON.stringify(node.plan.transformDef)
    const currentVersionHash = computeDerivedVersionHash(
      tableId,
      transformDefJson,
      upstreamHashes
    )
    
    // Check if table actually exists in DuckDB (it gets cleared on page refresh)
    const existsInEngine = await tableExistsInEngine(tableId)
    const hasDataInStore = dataStore.tableData[tableId]?.rows?.length > 0
    
    // Check if cache is valid AND table exists in engine AND we have data
    if (
      existsInEngine &&
      hasDataInStore &&
      !node.cacheInfo?.isDirty &&
      node.cacheInfo?.currentVersionHash === currentVersionHash &&
      node.cacheInfo?.lastUpstreamHash === upstreamHashes.join(':')
    ) {
      projectStore.updateCacheInfo(tableId, { isComputing: false })
      return {
        status: 'cached',
        tableId,
        rowCount: node.cacheInfo.lastRowCount,
        schema: node.schema,
      }
    }
    
    // Build mappings from upstream tables BEFORE executing transform:
    // - nameToId: human-readable name -> original column ID (e.g., "Date" -> "col_5_date")
    // - idToName: original column ID -> human-readable name (e.g., "col_5_date" -> "Date")
    const nameToId = new Map<string, string>()
    const idToName = new Map<string, string>()
    
    for (const upstreamId of node.plan.upstreamNodeIds) {
      const upstreamNode = projectStore.getTableNode(upstreamId)
      if (upstreamNode?.schema?.columns) {
        for (const col of upstreamNode.schema.columns) {
          // Map both directions for lookups
          nameToId.set(col.name, col.id)
          idToName.set(col.id, col.name)
          // Also map by lowercase for case-insensitive matching
          nameToId.set(col.name.toLowerCase(), col.id)
        }
      }
    }
    
    // Convert idToName map to plain object for passing to worker
    const columnIdToName: Record<string, string> = {}
    idToName.forEach((name, id) => {
      columnIdToName[id] = name
    })
    
    // Execute the transform with column mappings
    const result = await engine.executeTransform(node.plan.transformDef, tableId, columnIdToName)
    
    // Update schema if changed, with proper column ID mapping
    if (result.schema) {
      
      // Update schema columns with proper IDs preserved from upstream
      // DuckDB returns human-readable names, we need to map back to original IDs
      const schemaWithIds = {
        ...result.schema,
        columns: result.schema.columns.map(col => {
          // col.id and col.name from DuckDB are the same (human-readable name like "Date")
          const duckDbColName = col.id
          
          // Find the original column ID from upstream tables
          const originalId = nameToId.get(duckDbColName) || nameToId.get(duckDbColName.toLowerCase())
          
          return {
            ...col,
            // Preserve original column ID if found, otherwise keep DuckDB name
            id: originalId || duckDbColName,
            // Name stays as the human-readable name
            name: duckDbColName,
            // duckDbName is what DuckDB actually uses for queries
            duckDbName: duckDbColName,
          }
        }),
      }
      
      projectStore.updateTableSchema(tableId, schemaWithIds)
    }
    
    // Fetch ALL data from DuckDB (not just preview) and store in dataStore.
    // DuckDB returns rows keyed by the engine column name (duckDbName ?? name);
    // keyRowsById re-keys them to the schema column ids that every consumer
    // (grid, canvas, export) expects.
    const updatedSchema = projectStore.getTableNode(tableId)?.schema
    try {
      const fullData = await engine.getSlice(tableId, 0, Math.max(result.rowCount, 10000))
      const rows: TableRow[] = updatedSchema
        ? keyRowsById(fullData.rows, updatedSchema, 'derived_row')
        : fullData.rows.map((row, idx) => ({ ...row, __rowId: `derived_row_${idx}` }) as TableRow)
      dataStore.setTableData(tableId, rows)
    } catch {
      // Fallback to preview if full fetch fails
      if (result.preview && result.preview.length > 0) {
        const rows: TableRow[] = updatedSchema
          ? keyRowsById(result.preview, updatedSchema, 'derived_row')
          : result.preview.map((row, idx) => ({ ...row, __rowId: `derived_row_${idx}` }) as TableRow)
        dataStore.setTableData(tableId, rows)
      }
    }
    
    // Update cache info
    projectStore.updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      currentVersionHash,
      lastUpstreamHash: upstreamHashes.join(':'),
      lastPlanHash: simpleHash(transformDefJson),
      lastRowCount: result.rowCount,
      error: undefined,
    })
    
    return {
      status: 'computed',
      tableId,
      rowCount: result.rowCount,
      schema: result.schema,
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[MaterializationService] Error computing derived table ${tableId}:`, error)
    
    projectStore.updateCacheInfo(tableId, {
      isComputing: false,
      error: errorMessage,
    })
    
    return {
      status: 'error',
      tableId,
      error: errorMessage,
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Ensure a table is materialized and ready for viewing.
 * 
 * For source tables: Loads from IndexedDB and applies patches
 * For derived tables: Recursively materializes upstreams, then executes transform
 * 
 * This function handles:
 * - Deduplication of concurrent requests for the same table
 * - Sequential execution to prevent race conditions
 * - Dependency ordering via topological sort
 */
export async function ensureTableMaterialized(tableId: string): Promise<MaterializationResult> {
  // Check if already in progress
  const existingPromise = inProgressMaterializations.get(tableId)
  if (existingPromise) {
    return existingPromise
  }
  
  // Create and track the materialization promise
  const materializationPromise = (async () => {
    // Add to queue for sequential execution
    const queuePromise = materializationQueue.then(async () => {
      return await materializeTableInternal(tableId)
    })
    
    // Update queue but ignore return value to maintain void type
    materializationQueue = queuePromise.then(() => {}).catch(() => {})
    
    return queuePromise
  })()
  
  inProgressMaterializations.set(tableId, materializationPromise)
  
  try {
    const result = await materializationPromise
    return result
  } finally {
    inProgressMaterializations.delete(tableId)
  }
}

/**
 * Internal implementation of table materialization.
 */
async function materializeTableInternal(tableId: string): Promise<MaterializationResult> {
  const projectStore = useProjectStore.getState()
  const node = projectStore.getTableNode(tableId)
  
  if (!node) {
    return {
      status: 'error',
      tableId,
      error: 'Table not found',
    }
  }
  
  // Source tables: just load
  if (node.kind === 'source_table') {
    return loadSourceTable(tableId)
  }
  
  // Derived tables: ensure upstreams first, then compute
  // Get computation order (topological sort of dependencies)
  const computationOrder = getComputationOrder(
    tableId,
    projectStore.nodes,
    projectStore.edges
  )
  
  // Materialize each table in order
  for (const nodeToCompute of computationOrder) {
    const tableNode = projectStore.getTableNode(nodeToCompute)
    if (!tableNode) continue
    
    if (tableNode.kind === 'source_table') {
      const result = await loadSourceTable(nodeToCompute)
      if (result.status === 'error') {
        // If an upstream fails, mark this table as error too
        if (nodeToCompute !== tableId) {
          projectStore.updateCacheInfo(tableId, {
            isComputing: false,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          })
          return {
            status: 'error',
            tableId,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          }
        }
        return result
      }
    } else if (tableNode.kind === 'derived_table') {
      const result = await computeDerivedTable(nodeToCompute)
      if (result.status === 'error') {
        // If an upstream fails, mark this table as error too
        if (nodeToCompute !== tableId) {
          projectStore.updateCacheInfo(tableId, {
            isComputing: false,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          })
          return {
            status: 'error',
            tableId,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          }
        }
        return result
      }
    }
  }
  
  // The target table should have been computed in the loop
  const finalNode = projectStore.getTableNode(tableId)
  return {
    status: finalNode?.cacheInfo?.error ? 'error' : 'computed',
    tableId,
    rowCount: finalNode?.cacheInfo?.lastRowCount,
    schema: finalNode?.schema,
    error: finalNode?.cacheInfo?.error,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a table needs materialization.
 */
export function needsMaterialization(tableId: string): boolean {
  const projectStore = useProjectStore.getState()
  const dataStore = useDataStore.getState()
  const node = projectStore.getTableNode(tableId)
  
  if (!node) return false
  
  // Check dirty flag
  if (node.cacheInfo?.isDirty) return true
  
  // Check if data is missing from store
  if (!dataStore.tableData[tableId]) return true
  
  // Check if version hash is missing (never computed)
  if (!node.cacheInfo?.currentVersionHash) return true
  
  return false
}

/**
 * Force recomputation of a table and its descendants.
 */
export async function forceMaterialize(tableId: string): Promise<MaterializationResult> {
  const projectStore = useProjectStore.getState()
  
  // Mark as dirty to force recomputation
  projectStore.markNodeAndDescendantsDirty(tableId)
  
  // Then materialize
  return ensureTableMaterialized(tableId)
}

/**
 * Get the materialization status of a table.
 */
export function getMaterializationStatus(tableId: string): {
  needsComputation: boolean
  isComputing: boolean
  hasError: boolean
  error?: string
  lastComputedAt?: string
} {
  const projectStore = useProjectStore.getState()
  const node = projectStore.getTableNode(tableId)
  
  if (!node) {
    return {
      needsComputation: false,
      isComputing: false,
      hasError: true,
      error: 'Table not found',
    }
  }
  
  return {
    needsComputation: node.cacheInfo?.isDirty ?? true,
    isComputing: node.cacheInfo?.isComputing ?? false,
    hasError: !!node.cacheInfo?.error,
    error: node.cacheInfo?.error,
    lastComputedAt: node.cacheInfo?.lastComputedAt,
  }
}

/**
 * Get a slice of a table's data.
 *
 * This is the single canonical read API for table data. It returns rows in the
 * exact same id-keyed shape as the data store (rows keyed by column `id` plus a
 * `__rowId`), which is what the grid, canvas, report and export all consume.
 *
 * Materialization is the only writer that turns raw file/engine output into
 * id-keyed rows in the data store, so reading straight from the store here
 * guarantees a single consistent representation everywhere.
 */
export async function getTableData(
  tableId: string,
  offset: number = 0,
  limit: number = 1000
): Promise<{ rows: TableRow[]; totalRows: number; error?: string }> {
  // Ensure the table is materialized (loads source files / computes derived
  // tables and populates the id-keyed data store).
  const result = await ensureTableMaterialized(tableId)

  if (result.status === 'error') {
    return {
      rows: [],
      totalRows: 0,
      error: result.error,
    }
  }

  const allRows = useDataStore.getState().tableData[tableId]?.rows ?? []

  return {
    rows: allRows.slice(offset, offset + limit),
    totalRows: allRows.length,
  }
}
