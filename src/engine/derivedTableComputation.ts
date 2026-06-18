import { getEngine } from './EngineAdapter'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import { simpleHash, computeDerivedVersionHash, tableExistsInEngine } from './cacheUtils'
import type { DerivedTableNode } from '@/types'
import type { MaterializationResult } from './materializationService'

/**
 * Compute a derived table by executing its transform against DuckDB.
 * Handles column ID mapping between DuckDB (human-readable names) and our schema (stable IDs).
 */
export async function computeDerivedTable(tableId: string): Promise<MaterializationResult> {
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

  projectStore.updateCacheInfo(tableId, { isComputing: true, error: undefined })

  try {
    const engine = getEngine()
    await engine.init()

    const upstreamHashes: string[] = []
    for (const upstreamId of node.plan.upstreamNodeIds) {
      const upstreamNode = projectStore.getTableNode(upstreamId)
      if (upstreamNode?.cacheInfo?.currentVersionHash) {
        upstreamHashes.push(upstreamNode.cacheInfo.currentVersionHash)
      }
    }

    const transformDefJson = JSON.stringify(node.plan.transformDef)
    const currentVersionHash = computeDerivedVersionHash(
      tableId,
      transformDefJson,
      upstreamHashes
    )

    const existsInEngine = await tableExistsInEngine(tableId)
    const hasDataInStore = dataStore.tableData[tableId]?.rows?.length > 0

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

    // Build bidirectional column name <-> ID maps from upstream schemas.
    // DuckDB operates on human-readable names; our schema uses stable generated IDs.
    const nameToId = new Map<string, string>()
    const idToName = new Map<string, string>()

    for (const upstreamId of node.plan.upstreamNodeIds) {
      const upstreamNode = projectStore.getTableNode(upstreamId)
      if (upstreamNode?.schema?.columns) {
        for (const col of upstreamNode.schema.columns) {
          nameToId.set(col.name, col.id)
          idToName.set(col.id, col.name)
          nameToId.set(col.name.toLowerCase(), col.id)
        }
      }
    }

    const columnIdToName: Record<string, string> = {}
    idToName.forEach((name, id) => {
      columnIdToName[id] = name
    })

    const result = await engine.executeTransform(node.plan.transformDef, tableId, columnIdToName)

    if (result.schema) {
      const schemaWithIds = {
        ...result.schema,
        columns: result.schema.columns.map(col => {
          const duckDbColName = col.id
          const originalId = nameToId.get(duckDbColName) || nameToId.get(duckDbColName.toLowerCase())

          return {
            ...col,
            id: originalId || duckDbColName,
            name: duckDbColName,
            duckDbName: duckDbColName,
          }
        }),
      }

      projectStore.updateTableSchema(tableId, schemaWithIds)
    }

    // No longer hydrate full result into dataStore — the grid reads
    // windowed slices directly from DuckDB via useWindowedRows.
    // Set a minimal marker so downstream code knows the table is ready.
    dataStore.setTableData(tableId, [])

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

