import { getEngine } from '../EngineAdapter'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import {
  simpleHash,
  computeDerivedVersionHash,
  computeSchemaFingerprint,
  getEngineTableRowCount,
} from './cacheUtils'
import { checkTransformOutputSafety } from '@/shared/enforce'
import type { CacheInfo, DerivedTableNode, TransformDef } from '@/types'
import {
  effectiveTableSchema,
  getNodeCacheInfo,
  updateNodeCacheInfo,
} from '@/state/tableRuntimeStore'
import type {
  MaterializationOptions,
  MaterializationResult,
} from './materializationService'
import {
  captureMaterializationScope,
  isMaterializationScopeCurrent,
  type MaterializationScope,
} from './materializationCoordinator'

interface DerivedSnapshot {
  generation: string
  node: DerivedTableNode
  cacheInfo?: CacheInfo
  upstreamHashes: string[]
  transformDefJson: string
  currentVersionHash: string
}

function captureDerivedSnapshot(tableId: string): DerivedSnapshot | undefined {
  const state = useProjectStore.getState()
  const node = state.getTableNode(tableId)
  if (!node || node.kind !== 'derived_table') return undefined

  const cacheInfo = getNodeCacheInfo(tableId)
  const upstreamHashes = node.plan.upstreamNodeIds.map((upstreamId) =>
    getNodeCacheInfo(upstreamId)?.currentVersionHash ?? 'missing'
  )
  const transformDefJson = JSON.stringify(node.plan.transformDef)
  const currentVersionHash = computeDerivedVersionHash(
    tableId,
    transformDefJson,
    upstreamHashes,
  )
  const generation = simpleHash(JSON.stringify({
    currentVersionHash,
    revision: cacheInfo?.dataRevision ?? 0,
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
    },
    cacheInfo: cacheInfo ? { ...cacheInfo } : undefined,
    upstreamHashes,
    transformDefJson,
    currentVersionHash,
  }
}

function derivedGenerationIsCurrent(
  tableId: string,
  generation: string,
  scope: MaterializationScope,
): boolean {
  const state = useProjectStore.getState()
  return isMaterializationScopeCurrent(scope, state.projectId)
    && captureDerivedSnapshot(tableId)?.generation === generation
}

export async function computeDerivedTable(
  tableId: string,
  scope: MaterializationScope = captureMaterializationScope(
    useProjectStore.getState().projectId,
  ),
  options: MaterializationOptions = {},
): Promise<MaterializationResult> {
  const announce = options.announce !== false
  const snapshot = captureDerivedSnapshot(tableId)

  if (!snapshot) {
    return {
      status: 'error',
      tableId,
      error: 'Derived table not found',
    }
  }

  try {
    const engine = getEngine()
    await engine.init()
    if (!derivedGenerationIsCurrent(tableId, snapshot.generation, scope)) {
      return { status: 'loading', tableId }
    }

    const engineRowCount = await getEngineTableRowCount(tableId)
    if (!derivedGenerationIsCurrent(tableId, snapshot.generation, scope)) {
      return { status: 'loading', tableId }
    }
    const existsInEngine = engineRowCount >= 0
    const expectedRows = snapshot.cacheInfo?.lastRowCount
    const engineHasExpectedData =
      expectedRows !== undefined && engineRowCount === expectedRows

    if (
      existsInEngine &&
      engineHasExpectedData &&
      !snapshot.cacheInfo?.isDirty &&
      snapshot.cacheInfo?.currentVersionHash === snapshot.currentVersionHash &&
      snapshot.cacheInfo?.lastUpstreamHash === snapshot.upstreamHashes.join(':')
    ) {
      updateNodeCacheInfo(tableId, {
        isComputing: false,
        error: undefined,
      })
      return {
        status: 'cached',
        tableId,
        rowCount: snapshot.cacheInfo?.lastRowCount,
        schema: effectiveTableSchema(snapshot.node),
      }
    }

    if (announce) updateNodeCacheInfo(tableId, { isComputing: true })

    const nameToId = new Map<string, string>()
    const idToName = new Map<string, string>()

    for (const upstreamId of snapshot.node.plan.upstreamNodeIds) {
      const upstreamSchema = effectiveTableSchema(
        useProjectStore.getState().getTableNode(upstreamId),
      )
      if (upstreamSchema?.columns) {
        for (const col of upstreamSchema.columns) {
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

    const transformDef = snapshot.node.plan.transformDef
    if (transformDef.type === 'join' || transformDef.type === 'union') {
      // Upstream data can change after join/union creation, so re-estimate output
      // size before materializing and fail clearly instead of browser/engine OOM.
      const estimatedRows = await engine.countCombinedTransformRows(
        transformDef as Extract<TransformDef, { type: 'join' | 'union' }>,
        columnIdToName,
      )
      if (!derivedGenerationIsCurrent(tableId, snapshot.generation, scope)) {
        return { status: 'loading', tableId }
      }
      const safetyCheck = checkTransformOutputSafety(estimatedRows)
      if (!safetyCheck.ok) {
        const action = transformDef.type === 'union' ? 'Appending these tables' : 'Joining these tables'
        const message = `${action} ${safetyCheck.reason}`
        updateNodeCacheInfo(tableId, {
          isDirty: true,
          isComputing: false,
          error: message,
        })
        return { status: 'error', tableId, error: message }
      }
    }

    const result = await engine.executeTransform(
      snapshot.node.plan.transformDef,
      tableId,
      columnIdToName,
    )
    if (!derivedGenerationIsCurrent(tableId, snapshot.generation, scope)) {
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

      useProjectStore.getState().setMaterializedTableSchema(tableId, schemaWithIds)
    }

    useDataStore.getState().setTableData(tableId, [])

    updateNodeCacheInfo(tableId, {
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

    if (derivedGenerationIsCurrent(tableId, snapshot.generation, scope)) {
      updateNodeCacheInfo(tableId, {
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

