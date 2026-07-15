import { getEngine } from './EngineAdapter'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import {
  simpleHash,
  computeDerivedVersionHash,
  computeSchemaFingerprint,
  getEngineTableRowCount,
} from './cacheUtils'
import type { DerivedTableNode } from '@/types'
import type { MaterializationResult } from './materializationService'

interface DerivedSnapshot {
  generation: string
  node: DerivedTableNode
  upstreamHashes: string[]
  transformDefJson: string
  currentVersionHash: string
}

function captureDerivedSnapshot(tableId: string): DerivedSnapshot | undefined {
  const state = useProjectStore.getState()
  const node = state.getTableNode(tableId)
  if (!node || node.kind !== 'derived_table') return undefined

  const upstreamHashes = node.plan.upstreamNodeIds.map((upstreamId) =>
    state.getTableNode(upstreamId)?.cacheInfo?.currentVersionHash ?? 'missing'
  )
  const transformDefJson = JSON.stringify(node.plan.transformDef)
  const currentVersionHash = computeDerivedVersionHash(
    tableId,
    transformDefJson,
    upstreamHashes,
  )
  const generation = simpleHash(JSON.stringify({
    currentVersionHash,
    revision: node.cacheInfo?.dataRevision ?? 0,
    updatedAt: node.updatedAt,
    schema: computeSchemaFingerprint(node.schema),
    upstreamNodeIds: node.plan.upstreamNodeIds,
  }))

  return {
    generation,
    node: {
      ...node,
      plan: {
        ...node.plan,
        transformDef: structuredClone(node.plan.transformDef),
        upstreamNodeIds: [...node.plan.upstreamNodeIds],
      },
      schema: node.schema
        ? { ...node.schema, columns: node.schema.columns.map((column) => ({ ...column })) }
        : undefined,
      cacheInfo: node.cacheInfo ? { ...node.cacheInfo } : undefined,
    },
    upstreamHashes,
    transformDefJson,
    currentVersionHash,
  }
}

function derivedGenerationIsCurrent(tableId: string, generation: string): boolean {
  return captureDerivedSnapshot(tableId)?.generation === generation
}

export async function computeDerivedTable(tableId: string): Promise<MaterializationResult> {
  const snapshot = captureDerivedSnapshot(tableId)

  if (!snapshot) {
    return {
      status: 'error',
      tableId,
      error: 'Derived table not found',
    }
  }

  useProjectStore.getState().updateCacheInfo(tableId, { isComputing: true })

  try {
    const engine = getEngine()
    await engine.init()
    if (!derivedGenerationIsCurrent(tableId, snapshot.generation)) {
      return { status: 'loading', tableId }
    }

    const engineRowCount = await getEngineTableRowCount(tableId)
    if (!derivedGenerationIsCurrent(tableId, snapshot.generation)) {
      return { status: 'loading', tableId }
    }
    const existsInEngine = engineRowCount >= 0
    const expectedRows = snapshot.node.cacheInfo?.lastRowCount
    const engineHasExpectedData =
      expectedRows !== undefined && engineRowCount === expectedRows

    if (
      existsInEngine &&
      engineHasExpectedData &&
      !snapshot.node.cacheInfo?.isDirty &&
      snapshot.node.cacheInfo?.currentVersionHash === snapshot.currentVersionHash &&
      snapshot.node.cacheInfo?.lastUpstreamHash === snapshot.upstreamHashes.join(':')
    ) {
      useProjectStore.getState().updateCacheInfo(tableId, {
        isComputing: false,
        error: undefined,
      })
      return {
        status: 'cached',
        tableId,
        rowCount: snapshot.node.cacheInfo?.lastRowCount,
        schema: snapshot.node.schema,
      }
    }

    const nameToId = new Map<string, string>()
    const idToName = new Map<string, string>()

    for (const upstreamId of snapshot.node.plan.upstreamNodeIds) {
      const upstreamNode = useProjectStore.getState().getTableNode(upstreamId)
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

    const result = await engine.executeTransform(
      snapshot.node.plan.transformDef,
      tableId,
      columnIdToName,
    )
    if (!derivedGenerationIsCurrent(tableId, snapshot.generation)) {
      return { status: 'loading', tableId }
    }

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

      useProjectStore.getState().updateTableSchema(tableId, schemaWithIds)
    }

    useDataStore.getState().setTableData(tableId, [])

    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      currentVersionHash: snapshot.currentVersionHash,
      lastUpstreamHash: snapshot.upstreamHashes.join(':'),
      lastPlanHash: simpleHash(snapshot.transformDefJson),
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

    if (derivedGenerationIsCurrent(tableId, snapshot.generation)) {
      useProjectStore.getState().updateCacheInfo(tableId, {
        isDirty: true,
        isComputing: false,
        error: errorMessage,
      })
    }

    return {
      status: 'error',
      tableId,
      error: errorMessage,
    }
  }
}

