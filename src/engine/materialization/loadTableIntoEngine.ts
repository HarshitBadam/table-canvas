import { getEngine } from '../EngineAdapter'
import {
  computePatchesVersion,
  computeSchemaFingerprint,
  computeSourceVersionHash,
  copyPatches,
  simpleHash,
} from './cacheUtils'
import type { LoadTableResult } from '../EngineAdapter'
import { enqueueEngineMutation } from './materializationCoordinator'
import { useProjectStore } from '@/state/projectStore'
import { getNodeCacheInfo, updateNodeCacheInfo } from '@/state/tableRuntimeStore'
import type { TableRow } from '@/state/dataStore'
import type { CellValue, Patches, TableSchema } from '@/types'

function captureLoadGeneration(tableId: string): string | undefined {
  const state = useProjectStore.getState()
  const node = state.getTableNode(tableId)
  if (!node || node.kind !== 'source_table') return undefined
  return simpleHash(JSON.stringify({
    revision: getNodeCacheInfo(tableId)?.dataRevision ?? 0,
    updatedAt: node.updatedAt,
    fileRef: node.plan.fileRef,
    schema: computeSchemaFingerprint(node.schema),
    patches: computePatchesVersion(state.patches[tableId]),
  }))
}

export async function loadEngineTable(
  tableId: string,
  schema: TableSchema,
  rows: Record<string, CellValue>[],
  patches?: Patches,
): Promise<LoadTableResult> {
  const engine = getEngine()
  await engine.init()
  return engine.loadTable(tableId, schema, rows, patches)
}

export async function loadTableIntoEngine(
  tableId: string,
  schema: TableSchema,
  rows: TableRow[],
): Promise<boolean> {
  // Import path bypasses ensureTableMaterialized; still join the shared mutation lane.
  return enqueueEngineMutation(() => loadTableIntoEngineUnlocked(tableId, schema, rows))
}

async function loadTableIntoEngineUnlocked(
  tableId: string,
  schema: TableSchema,
  rows: TableRow[],
): Promise<boolean> {
  const startGeneration = captureLoadGeneration(tableId)
  const operationGeneration = getNodeCacheInfo(tableId)?.operationGeneration
  updateNodeCacheInfo(tableId, {
    isComputing: true,
    phase: 'materializing',
    error: undefined,
  })
  try {
    const node = useProjectStore.getState().getTableNode(tableId)
    const patches = copyPatches(useProjectStore.getState().patches[tableId])
    const loadResult = await loadEngineTable(tableId, schema, rows, patches)
    // Prefer the import operation token over the fragile content hash: updateNode
    // during staging changes updatedAt/fileRef and would otherwise false-fail large imports.
    if (
      operationGeneration !== undefined
        ? getNodeCacheInfo(tableId)?.operationGeneration !== operationGeneration
        : startGeneration !== captureLoadGeneration(tableId)
    ) {
      return false
    }

    const fileRef = node?.kind === 'source_table' ? node.plan.fileRef : undefined
    const currentVersionHash = computeSourceVersionHash(
      tableId,
      fileRef ?? '',
      computePatchesVersion(patches),
      computeSchemaFingerprint(schema),
    )

    updateNodeCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      lastRowCount: rows.length,
      currentVersionHash,
      error: undefined,
      warnings: loadResult?.warnings,
      phase: 'ready',
    })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load into engine'
    if (
      operationGeneration === undefined
      || getNodeCacheInfo(tableId)?.operationGeneration === operationGeneration
    ) {
      updateNodeCacheInfo(tableId, {
        isDirty: true,
        isComputing: false,
        error: message,
        phase: 'error',
      })
    }
    throw error instanceof Error ? error : new Error(message)
  }
}
