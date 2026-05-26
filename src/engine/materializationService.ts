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
import { computeSourceVersionHash, tableExistsInEngine } from './cacheUtils'
import { parseFileData } from './fileParsers'
import { computeDerivedTable } from './derivedTableComputation'
import type {
  SourceTableNode,
  CellValue,
  TableSchema,
} from '@/types'


export type MaterializationStatus =
  | 'cached'
  | 'computed'
  | 'loading'
  | 'error'

export interface MaterializationResult {
  status: MaterializationStatus
  tableId: string
  rowCount?: number
  schema?: TableSchema
  error?: string
}

// Deduplicates concurrent requests for the same table
const inProgressMaterializations = new Map<string, Promise<MaterializationResult>>()

// Sequential execution mutex to avoid race conditions
let materializationQueue = Promise.resolve()


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

  projectStore.updateCacheInfo(tableId, { isComputing: true, error: undefined })

  try {
    const engine = getEngine()
    await engine.init()

    const existingData = dataStore.tableData[tableId]
    const patches = projectStore.patches[tableId]

    const patchVersion = patches
      ? `${patches.insertedRows?.length || 0}-${Object.keys(patches.cellPatches || {}).length}-${patches.deletedRows?.size || 0}`
      : '0-0-0'

    const currentVersionHash = computeSourceVersionHash(
      tableId,
      node.plan.fileRef,
      patchVersion
    )

    const existsInEngine = await tableExistsInEngine(tableId)

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

    let rows: TableRow[] = []

    if (node.plan.fileRef) {
      const fileData = await loadFileWithSync(node.plan.fileRef)
      if (fileData) {
        rows = await parseFileData(fileData, node.plan.fileType, node.plan.sheetName, node.schema)

        rows = rows.map((row, idx) => ({
          ...row,
          __rowId: row.__rowId || `row_${idx}`,
        }))

        dataStore.setTableData(tableId, rows)
      } else {
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
      // Manually created table with no file backing
      rows = existingData?.rows ?? []
      if (!existingData?.rows) {
        dataStore.setTableData(tableId, rows)
      }
    }

    if (node.schema) {
      await engine.loadTable(tableId, node.schema, rows as Record<string, CellValue>[], patches)
    }

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
 * Ensure a table is materialized and ready for viewing.
 *
 * For source tables: Loads from IndexedDB and applies patches
 * For derived tables: Recursively materializes upstreams, then executes transform
 *
 * Handles deduplication of concurrent requests and sequential execution.
 */
export async function ensureTableMaterialized(tableId: string): Promise<MaterializationResult> {
  const existingPromise = inProgressMaterializations.get(tableId)
  if (existingPromise) {
    return existingPromise
  }

  const materializationPromise = (async () => {
    const queuePromise = materializationQueue.then(async () => {
      return await materializeTableInternal(tableId)
    })

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

  if (node.kind === 'source_table') {
    return loadSourceTable(tableId)
  }

  const computationOrder = getComputationOrder(
    tableId,
    projectStore.nodes,
    projectStore.edges
  )

  for (const nodeToCompute of computationOrder) {
    const tableNode = projectStore.getTableNode(nodeToCompute)
    if (!tableNode) continue

    if (tableNode.kind === 'source_table') {
      const result = await loadSourceTable(nodeToCompute)
      if (result.status === 'error') {
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

  const finalNode = projectStore.getTableNode(tableId)
  return {
    status: finalNode?.cacheInfo?.error ? 'error' : 'computed',
    tableId,
    rowCount: finalNode?.cacheInfo?.lastRowCount,
    schema: finalNode?.schema,
    error: finalNode?.cacheInfo?.error,
  }
}


/**
 * Check if a table needs materialization.
 */
export function needsMaterialization(tableId: string): boolean {
  const projectStore = useProjectStore.getState()
  const dataStore = useDataStore.getState()
  const node = projectStore.getTableNode(tableId)

  if (!node) return false
  if (node.cacheInfo?.isDirty) return true
  if (!dataStore.tableData[tableId]) return true
  if (!node.cacheInfo?.currentVersionHash) return true

  return false
}

/**
 * Force recomputation of a table and its descendants.
 */
export async function forceMaterialize(tableId: string): Promise<MaterializationResult> {
  const projectStore = useProjectStore.getState()
  projectStore.markNodeAndDescendantsDirty(tableId)
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
 * Used by GridView and other components to get paginated data.
 */
export async function getTableData(
  tableId: string,
  offset: number = 0,
  limit: number = 1000
): Promise<{ rows: TableRow[]; totalRows: number; error?: string }> {
  const result = await ensureTableMaterialized(tableId)

  if (result.status === 'error') {
    return {
      rows: [],
      totalRows: 0,
      error: result.error,
    }
  }

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
