import { getComputationOrder } from './dependencyGraph'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { loadFileWithSync } from '@/persistence/syncService'
import {
  computePatchesVersion,
  computeSchemaFingerprint,
  computeSourceVersionHash,
  copyPatches,
  copySchema,
  getEngineTableRowCount,
  simpleHash,
} from './cacheUtils'
import { computeDerivedTable } from './derivedTableComputation'
import {
  effectiveTableSchema,
  getNodeCacheInfo,
  isTableWaiting,
  updateNodeCacheInfo,
} from '@/state/tableRuntimeStore'
import { waitForTableOperation } from '@/state/tableOperationCoordinator'
import { loadEngineTable } from './loadTableIntoEngine'
import {
  captureMaterializationScope,
  enqueueEngineMutation,
  isMaterializationScopeCurrent,
  type MaterializationScope,
} from './materializationCoordinator'
import type {
  SourceTableNode,
  CacheInfo,
  CellValue,
  Patches,
  TableSchema,
} from '@/types'
type MaterializationStatus =
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

export interface MaterializationOptions {
  /**
   * When false, skip the shared "Updating…" cache flag so background refresh
   * does not flash status badges on every canvas node. Callers that are
   * actively waiting on data (grid, previews) leave this at the default.
   */
  announce?: boolean
}

const inProgressMaterializations = new Map<string, Promise<MaterializationResult>>()

interface SourceSnapshot {
  generation: string
  node: SourceTableNode
  cacheInfo?: CacheInfo
  schema?: TableSchema
  patches?: Patches
  currentVersionHash: string
}

function captureSourceSnapshot(tableId: string): SourceSnapshot | undefined {
  const state = useProjectStore.getState()
  const node = state.getTableNode(tableId)
  if (!node || node.kind !== 'source_table') return undefined

  const cacheInfo = getNodeCacheInfo(tableId)
  const schema = copySchema(node.schema)
  const patches = copyPatches(state.patches[tableId])
  const patchVersion = computePatchesVersion(patches)
  const schemaFingerprint = computeSchemaFingerprint(schema)
  const currentVersionHash = computeSourceVersionHash(
    tableId,
    node.plan.fileRef,
    patchVersion,
    schemaFingerprint,
  )
  const generation = simpleHash(JSON.stringify({
    version: currentVersionHash,
    revision: cacheInfo?.dataRevision ?? 0,
    updatedAt: node.updatedAt,
    fileType: node.plan.fileType,
    sheetName: node.plan.sheetName ?? null,
    initialRows: node.plan.initialRows ?? null,
  }))

  return {
    generation,
    node: {
      ...node,
      plan: {
        ...node.plan,
        initialRows: node.plan.initialRows?.map((row) => ({ ...row })),
      },
      schema,
    },
    cacheInfo: cacheInfo ? { ...cacheInfo } : undefined,
    schema,
    patches,
    currentVersionHash,
  }
}

function scopeIsCurrent(scope: MaterializationScope): boolean {
  return isMaterializationScopeCurrent(scope, useProjectStore.getState().projectId)
}

function sourceGenerationIsCurrent(
  tableId: string,
  generation: string,
  scope: MaterializationScope,
): boolean {
  return scopeIsCurrent(scope) && captureSourceSnapshot(tableId)?.generation === generation
}

function staleMaterialization(tableId: string): MaterializationResult {
  return { status: 'loading', tableId }
}

function captureTableRequestGeneration(tableId: string): string | undefined {
  const node = useProjectStore.getState().getTableNode(tableId)
  if (!node) return undefined
  return simpleHash(JSON.stringify({
    kind: node.kind,
    plan: node.plan,
    schema: computeSchemaFingerprint(node.schema),
    revision: getNodeCacheInfo(tableId)?.dataRevision ?? 0,
    updatedAt: node.updatedAt,
  }))
}

async function loadSourceTable(
  tableId: string,
  scope: MaterializationScope,
  options: MaterializationOptions = {},
): Promise<MaterializationResult> {
  const announce = options.announce !== false
  let snapshot = captureSourceSnapshot(tableId)
  if (!snapshot) {
    return {
      status: 'error',
      tableId,
      error: 'Source table not found',
    }
  }
  try {
    if (isTableWaiting(snapshot.cacheInfo)) {
      return {
        status: 'error',
        tableId,
        error: 'Table is still preparing. Try again in a moment.',
      }
    }
    const engineRowCount = await getEngineTableRowCount(tableId)
    if (!sourceGenerationIsCurrent(tableId, snapshot.generation, scope)) {
      return staleMaterialization(tableId)
    }
    const existsInEngine = engineRowCount >= 0
    const expectedRows = snapshot.cacheInfo?.lastRowCount
    const engineHasExpectedData =
      expectedRows !== undefined && engineRowCount === expectedRows
    if (
      existsInEngine &&
      engineHasExpectedData &&
      snapshot.cacheInfo?.currentVersionHash === snapshot.currentVersionHash &&
      !snapshot.cacheInfo?.isDirty
    ) {
      updateNodeCacheInfo(tableId, {
        isComputing: false,
        error: undefined,
        phase: 'ready',
      })
      return {
        status: 'cached',
        tableId,
        rowCount: snapshot.cacheInfo?.lastRowCount ?? 0,
        schema: snapshot.schema,
      }
    }

    if (announce) updateNodeCacheInfo(tableId, {
      isComputing: true,
      phase: 'materializing',
    })
    let rows: TableRow[] = []
    if (snapshot.node.plan.fileRef) {
      const fileData = await loadFileWithSync(snapshot.node.plan.fileRef)
      if (!sourceGenerationIsCurrent(tableId, snapshot.generation, scope)) {
        return staleMaterialization(tableId)
      }
      snapshot = captureSourceSnapshot(tableId)!
      if (fileData) {
        const { parseFileData } = await import('./fileParsers')
        rows = await parseFileData(
          fileData,
          snapshot.node.plan.fileType,
          snapshot.node.plan.sheetName,
          snapshot.schema,
        )
        if (!sourceGenerationIsCurrent(tableId, snapshot.generation, scope)) {
          return staleMaterialization(tableId)
        }
        rows = rows.map((row, idx) => ({
          ...row,
          __rowId: row.__rowId || `row_${idx}`,
        }))
        useDataStore.getState().setTableData(tableId, [])
      } else {
        updateNodeCacheInfo(tableId, {
          isDirty: true,
          isComputing: false,
          error: 'Data file not found. Please re-import the file.',
          phase: 'error',
        })

        return {
          status: 'error',
          tableId,
          error: 'Data file not found. Please re-import the file.',
        }
      }
    } else {
      snapshot = captureSourceSnapshot(tableId)!
      const initialRows = snapshot.node.plan.initialRows as TableRow[] | undefined
      const runtimeRows = useDataStore.getState().tableData[tableId]?.rows
      rows = initialRows
        ?? (runtimeRows?.length ? runtimeRows.map((row) => ({ ...row })) : Array.from(
          { length: snapshot.schema?.rowCount ?? 0 },
          (_, index) => ({ __rowId: `row_${index}` }),
        ))
      if (!initialRows && !runtimeRows?.length) {
        useDataStore.getState().setTableData(tableId, [])
      }
    }

    if (!snapshot.schema) {
      throw new Error('Source table schema is missing')
    }

    const loadResult = await loadEngineTable(
      tableId,
      snapshot.schema,
      rows as Record<string, CellValue>[],
      snapshot.patches,
    )
    if (!sourceGenerationIsCurrent(tableId, snapshot.generation, scope)) {
      return staleMaterialization(tableId)
    }

    const loadedRowCount = await getEngineTableRowCount(tableId)
    if (!sourceGenerationIsCurrent(tableId, snapshot.generation, scope)) {
      return staleMaterialization(tableId)
    }
    const rowCount = loadedRowCount >= 0 ? loadedRowCount : rows.length

    updateNodeCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      currentVersionHash: snapshot.currentVersionHash,
      lastRowCount: rowCount,
      error: undefined,
      warnings: loadResult?.warnings,
      phase: 'ready',
    })

    return {
      status: 'computed',
      tableId,
      rowCount,
      schema: snapshot.schema,
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const generation = snapshot?.generation

    if (generation && sourceGenerationIsCurrent(tableId, generation, scope)) {
      updateNodeCacheInfo(tableId, {
        isDirty: true,
        isComputing: false,
        error: errorMessage,
        phase: 'error',
      })
    }

    return {
      status: 'error',
      tableId,
      error: errorMessage,
    }
  }
}


async function waitForRelatedTableOperations(tableId: string): Promise<void> {
  const projectStore = useProjectStore.getState()
  const node = projectStore.getTableNode(tableId)
  if (!node) {
    await waitForTableOperation(tableId)
    return
  }
  if (node.kind === 'source_table') {
    await waitForTableOperation(tableId)
    return
  }
  // getComputationOrder includes tableId itself (by design, for materializeTableInternal's
  // use below, which also needs to recompute the target). Waiting on tableId's own gate
  // here would deadlock: that gate is only released by completeTableOperation/
  // failTableOperation, which run strictly after this function's caller
  // (ensureTableMaterialized) resolves — e.g. a freshly created join/union table has its
  // gate opened with beginTableOperation(id, 'waiting') right before ensureTableMaterialized
  // is called on that same id. Only wait on the upstream tables it actually depends on.
  const order = getComputationOrder(tableId, projectStore.nodes, projectStore.edges)
  for (const relatedId of order) {
    if (relatedId === tableId) continue
    await waitForTableOperation(relatedId)
  }
}

export async function ensureTableMaterialized(
  tableId: string,
  options: MaterializationOptions = {},
): Promise<MaterializationResult> {
  const projectId = useProjectStore.getState().projectId
  const scope = captureMaterializationScope(projectId)
  const announce = options.announce !== false
  const requestKey = `${scope.projectId}:${scope.generation}:${tableId}:${announce ? 'a' : 's'}`
  const existingPromise = inProgressMaterializations.get(requestKey)
  if (existingPromise) {
    return existingPromise
  }

  // Wait for import/op gates BEFORE taking the mutation queue. Waiting inside
  // the queue deadlocks against loadTableIntoEngine, which uses the same lane.
  const materializationPromise = (async () => {
    await waitForRelatedTableOperations(tableId)
    if (!scopeIsCurrent(scope)) return staleMaterialization(tableId)
    return enqueueEngineMutation(async () => {
      let result = await materializeTableInternal(tableId, scope, options)
      while (result.status === 'loading' && scopeIsCurrent(scope)) {
        result = await materializeTableInternal(tableId, scope, options)
      }
      return result
    })
  })()

  inProgressMaterializations.set(requestKey, materializationPromise)

  try {
    const result = await materializationPromise
    return result
  } finally {
    if (inProgressMaterializations.get(requestKey) === materializationPromise) {
      inProgressMaterializations.delete(requestKey)
    }
  }
}

async function materializeTableInternal(
  tableId: string,
  scope: MaterializationScope,
  options: MaterializationOptions = {},
): Promise<MaterializationResult> {
  if (!scopeIsCurrent(scope)) return staleMaterialization(tableId)
  const projectStore = useProjectStore.getState()
  const node = projectStore.getTableNode(tableId)
  const requestGeneration = captureTableRequestGeneration(tableId)

  if (!node) {
    return {
      status: 'error',
      tableId,
      error: 'Table not found',
    }
  }

  if (node.kind === 'source_table') {
    return loadSourceTable(tableId, scope, options)
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
      const result = await loadSourceTable(nodeToCompute, scope, options)
      if (result.status === 'error') {
        if (nodeToCompute !== tableId) {
          if (scopeIsCurrent(scope) && captureTableRequestGeneration(tableId) === requestGeneration) {
            updateNodeCacheInfo(tableId, {
              isDirty: true,
              isComputing: false,
              error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
            })
          }
          return {
            status: 'error',
            tableId,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          }
        }
        return result
      }
    } else if (tableNode.kind === 'derived_table') {
      const result = await computeDerivedTable(nodeToCompute, scope, options)
      if (result.status === 'error') {
        if (nodeToCompute !== tableId) {
          if (scopeIsCurrent(scope) && captureTableRequestGeneration(tableId) === requestGeneration) {
            updateNodeCacheInfo(tableId, {
              isDirty: true,
              isComputing: false,
              error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
            })
          }
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

  if (!scopeIsCurrent(scope)) return staleMaterialization(tableId)
  const finalNode = useProjectStore.getState().getTableNode(tableId)
  const finalCacheInfo = getNodeCacheInfo(tableId)
  return {
    status: finalCacheInfo?.error ? 'error' : 'computed',
    tableId,
    rowCount: finalCacheInfo?.lastRowCount,
    schema: effectiveTableSchema(finalNode),
    error: finalCacheInfo?.error,
  }
}

