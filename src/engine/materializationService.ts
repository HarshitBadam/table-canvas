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
import { loadEngineTable } from './loadTableIntoEngine'
import {
  captureMaterializationScope,
  enqueueEngineMutation,
  isMaterializationScopeCurrent,
  type MaterializationScope,
} from './materializationCoordinator'
import type {
  SourceTableNode,
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

const inProgressMaterializations = new Map<string, Promise<MaterializationResult>>()

interface SourceSnapshot {
  generation: string
  node: SourceTableNode
  schema?: TableSchema
  patches?: Patches
  currentVersionHash: string
}

function captureSourceSnapshot(tableId: string): SourceSnapshot | undefined {
  const state = useProjectStore.getState()
  const node = state.getTableNode(tableId)
  if (!node || node.kind !== 'source_table') return undefined

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
    revision: node.cacheInfo?.dataRevision ?? 0,
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
      cacheInfo: node.cacheInfo ? { ...node.cacheInfo } : undefined,
    },
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
    revision: node.cacheInfo?.dataRevision ?? 0,
    updatedAt: node.updatedAt,
  }))
}

async function loadSourceTable(
  tableId: string,
  scope: MaterializationScope,
): Promise<MaterializationResult> {
  let snapshot = captureSourceSnapshot(tableId)
  if (!snapshot) {
    return {
      status: 'error',
      tableId,
      error: 'Source table not found',
    }
  }
  useProjectStore.getState().updateCacheInfo(tableId, { isComputing: true })
  try {
    const engineRowCount = await getEngineTableRowCount(tableId)
    if (!sourceGenerationIsCurrent(tableId, snapshot.generation, scope)) {
      return staleMaterialization(tableId)
    }
    const existsInEngine = engineRowCount >= 0
    const expectedRows = snapshot.node.cacheInfo?.lastRowCount
    const engineHasExpectedData =
      expectedRows !== undefined && engineRowCount === expectedRows
    if (
      existsInEngine &&
      engineHasExpectedData &&
      snapshot.node.cacheInfo?.currentVersionHash === snapshot.currentVersionHash &&
      !snapshot.node.cacheInfo?.isDirty
    ) {
      useProjectStore.getState().updateCacheInfo(tableId, {
        isComputing: false,
        error: undefined,
      })
      return {
        status: 'cached',
        tableId,
        rowCount: snapshot.node.cacheInfo?.lastRowCount ?? 0,
        schema: snapshot.schema,
      }
    }
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
        useProjectStore.getState().updateCacheInfo(tableId, {
          isDirty: true,
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

    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      currentVersionHash: snapshot.currentVersionHash,
      lastRowCount: rowCount,
      error: undefined,
      warnings: loadResult?.warnings,
    })

    return {
      status: 'computed',
      tableId,
      rowCount,
      schema: snapshot.schema,
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (sourceGenerationIsCurrent(tableId, snapshot.generation, scope)) {
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


export async function ensureTableMaterialized(tableId: string): Promise<MaterializationResult> {
  const projectId = useProjectStore.getState().projectId
  const scope = captureMaterializationScope(projectId)
  const requestKey = `${scope.projectId}:${scope.generation}:${tableId}`
  const existingPromise = inProgressMaterializations.get(requestKey)
  if (existingPromise) {
    return existingPromise
  }

  const materializationPromise = enqueueEngineMutation(async () => {
    let result = await materializeTableInternal(tableId, scope)
    while (result.status === 'loading' && scopeIsCurrent(scope)) {
      result = await materializeTableInternal(tableId, scope)
    }
    return result
  })

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
    return loadSourceTable(tableId, scope)
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
      const result = await loadSourceTable(nodeToCompute, scope)
      if (result.status === 'error') {
        if (nodeToCompute !== tableId) {
          if (scopeIsCurrent(scope) && captureTableRequestGeneration(tableId) === requestGeneration) {
            useProjectStore.getState().updateCacheInfo(tableId, {
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
      const result = await computeDerivedTable(nodeToCompute, scope)
      if (result.status === 'error') {
        if (nodeToCompute !== tableId) {
          if (scopeIsCurrent(scope) && captureTableRequestGeneration(tableId) === requestGeneration) {
            useProjectStore.getState().updateCacheInfo(tableId, {
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
  return {
    status: finalNode?.cacheInfo?.error ? 'error' : 'computed',
    tableId,
    rowCount: finalNode?.cacheInfo?.lastRowCount,
    schema: finalNode?.schema,
    error: finalNode?.cacheInfo?.error,
  }
}

export { getTableData } from './tableDataService'
