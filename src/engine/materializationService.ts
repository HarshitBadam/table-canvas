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
import { loadFile } from '@/persistence/db'
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
    
    console.log(`[MaterializationService] Loading source table ${tableId}...`, {
      existsInEngine,
      hasExistingData: !!existingData?.rows?.length,
      isDirty: node.cacheInfo?.isDirty,
    })
    
    // Load data from IndexedDB
    let rows: TableRow[] = []
    
    if (node.plan.fileRef) {
      const fileData = await loadFile(node.plan.fileRef)
      if (fileData) {
        // Parse file data based on type, passing schema for proper column mapping
        rows = await parseFileData(fileData, node.plan.fileType, node.plan.sheetName, node.schema)
        
        // Assign row IDs if missing
        rows = rows.map((row, idx) => ({
          ...row,
          __rowId: row.__rowId || `row_${idx}`,
        }))
        
        console.log(`[MaterializationService] Loaded ${rows.length} rows from file`)
      } else {
        // File not in IndexedDB - this happens for projects created before file saving was implemented
        // User needs to re-import the data
        console.warn(`[MaterializationService] File not found in IndexedDB: ${node.plan.fileRef}`)
        console.warn('[MaterializationService] Please re-import the data file to restore the table')
        
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
    }
    
    // Update dataStore with loaded rows
    dataStore.setTableData(tableId, rows)
    
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
    console.error(`[MaterializationService] Error loading source table ${tableId}:`, error)
    
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
  console.log(`[MaterializationService] Parsing ${fileType} file...`, fileData.byteLength, 'bytes')
  
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
function parseCSVData(fileData: ArrayBuffer, schema?: TableSchema): Promise<TableRow[]> {
  return new Promise((resolve) => {
    const decoder = new TextDecoder('utf-8')
    const text = decoder.decode(fileData)
    
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('[MaterializationService] CSV parsing warnings:', results.errors)
        }
        
        const rows = convertToTableRows(results.data, results.meta.fields || [], schema)
        resolve(rows)
      },
      error: (error: Error) => {
        console.error('[MaterializationService] CSV parsing error:', error)
        resolve([])
      },
    })
  })
}

/**
 * Parse Excel data from ArrayBuffer
 */
function parseExcelData(fileData: ArrayBuffer, sheetName?: string, schema?: TableSchema): Promise<TableRow[]> {
  return new Promise((resolve) => {
    try {
      const wb = XLSX.read(fileData, { type: 'array' })
      const targetSheet = sheetName || wb.SheetNames[0]
      const sheet = wb.Sheets[targetSheet]
      
      if (!sheet) {
        console.error(`[MaterializationService] Sheet "${targetSheet}" not found`)
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
 * Convert parsed data to TableRow format with proper column IDs
 */
function convertToTableRows(
  data: Record<string, string>[],
  fields: string[],
  schema?: TableSchema
): TableRow[] {
  // Create a mapping from column name to column id
  const columnIdMap = new Map<string, string>()
  
  if (schema?.columns) {
    schema.columns.forEach((col: ColumnSchema) => {
      columnIdMap.set(col.name, col.id)
    })
  } else {
    // Generate column IDs if no schema
    fields.forEach((field, index) => {
      const columnId = `col_${index}_${field.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      columnIdMap.set(field, columnId)
    })
  }
  
  return data.map((row, index) => {
    const rowId = `row_${index}`
    const rowData: TableRow = { __rowId: rowId }
    
    fields.forEach((field) => {
      const colId = columnIdMap.get(field) || field
      let value: CellValue = row[field]
      
      // Find column schema for type conversion
      const colSchema = schema?.columns.find((c: ColumnSchema) => c.id === colId || c.name === field)
      
      if (colSchema?.type === 'number' && value !== '' && value !== null) {
        const num = parseFloat(String(value).replace(/,/g, ''))
        value = isNaN(num) ? value : num
      } else if (colSchema?.type === 'boolean') {
        const lower = String(value).toLowerCase()
        if (lower === 'true' || lower === '1' || lower === 'yes') value = true
        else if (lower === 'false' || lower === '0' || lower === 'no') value = false
      }
      
      rowData[colId] = value
    })
    
    return rowData
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
    
    console.log(`[MaterializationService] Computing derived table ${tableId}...`, {
      existsInEngine,
      hasDataInStore,
      isDirty: node.cacheInfo?.isDirty,
    })
    
    // Execute the transform
    const result = await engine.executeTransform(node.plan.transformDef, tableId)
    
    // Update schema if changed, with proper column name mapping
    if (result.schema) {
      // Build a column ID to name mapping from upstream source tables
      const columnNameMap = new Map<string, string>()
      
      for (const upstreamId of node.plan.upstreamNodeIds) {
        const upstreamNode = projectStore.getTableNode(upstreamId)
        if (upstreamNode?.schema?.columns) {
          for (const col of upstreamNode.schema.columns) {
            // Map column ID to its human-readable name
            columnNameMap.set(col.id, col.name)
          }
        }
      }
      
      // Update schema columns with proper names
      const schemaWithNames = {
        ...result.schema,
        columns: result.schema.columns.map(col => ({
          ...col,
          // Use the mapped name if available, otherwise use the existing name
          name: columnNameMap.get(col.id) || col.name,
        })),
      }
      
      projectStore.updateTableSchema(tableId, schemaWithNames)
    }
    
    // Fetch ALL data from DuckDB (not just preview) and store in dataStore
    try {
      const fullData = await engine.getSlice(tableId, 0, Math.max(result.rowCount, 10000))
      const rows: TableRow[] = fullData.rows.map((row, idx) => ({
        ...row,
        __rowId: `derived_row_${idx}`,
      })) as TableRow[]
      dataStore.setTableData(tableId, rows)
      console.log(`[MaterializationService] Stored ${rows.length} rows for derived table ${tableId}`)
    } catch (sliceError) {
      // Fallback to preview if full fetch fails
      console.warn('[MaterializationService] Failed to fetch full data, using preview:', sliceError)
      if (result.preview && result.preview.length > 0) {
        const rows: TableRow[] = result.preview.map((row, idx) => ({
          ...row,
          __rowId: `derived_row_${idx}`,
        })) as TableRow[]
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
 * Get the full slice of data for a table.
 * This is used by GridView and other components to get the complete data.
 */
export async function getTableData(
  tableId: string, 
  offset: number = 0, 
  limit: number = 1000
): Promise<{ rows: TableRow[]; totalRows: number; error?: string }> {
  // First ensure the table is materialized
  const result = await ensureTableMaterialized(tableId)
  
  if (result.status === 'error') {
    return {
      rows: [],
      totalRows: 0,
      error: result.error,
    }
  }
  
  // Get data from the engine
  try {
    const engine = getEngine()
    const slice = await engine.getSlice(tableId, offset, limit)
    
    const rows: TableRow[] = slice.rows.map((row, idx) => ({
      ...row,
      __rowId: row.__rowId as string || `row_${offset + idx}`,
    })) as TableRow[]
    
    return {
      rows,
      totalRows: slice.totalRows,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      rows: [],
      totalRows: 0,
      error: errorMessage,
    }
  }
}
