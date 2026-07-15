import { getEngine } from './EngineAdapter'
import {
  computePatchesVersion,
  computeSchemaFingerprint,
  computeSourceVersionHash,
  copyPatches,
  simpleHash,
} from './cacheUtils'
import type { LoadTableResult } from './EngineAdapter'
import { useProjectStore } from '@/state/projectStore'
import type { TableRow } from '@/state/dataStore'
import type { CellValue, Patches, TableSchema } from '@/types'

function captureLoadGeneration(tableId: string): string | undefined {
  const state = useProjectStore.getState()
  const node = state.getTableNode(tableId)
  if (!node || node.kind !== 'source_table') return undefined
  return simpleHash(JSON.stringify({
    revision: node.cacheInfo?.dataRevision ?? 0,
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
  const startGeneration = captureLoadGeneration(tableId)
  try {
    const node = useProjectStore.getState().getTableNode(tableId)
    const patches = copyPatches(useProjectStore.getState().patches[tableId])
    const loadResult = await loadEngineTable(tableId, schema, rows, patches)
    if (startGeneration !== captureLoadGeneration(tableId)) return false

    const fileRef = node?.kind === 'source_table' ? node.plan.fileRef : undefined
    const currentVersionHash = computeSourceVersionHash(
      tableId,
      fileRef ?? '',
      computePatchesVersion(patches),
      computeSchemaFingerprint(schema),
    )

    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      lastRowCount: rows.length,
      currentVersionHash,
      error: undefined,
      warnings: loadResult?.warnings,
    })
    return true
  } catch (error) {
    if (startGeneration === captureLoadGeneration(tableId)) {
      useProjectStore.getState().updateCacheInfo(tableId, {
        isDirty: true,
        isComputing: false,
        error: error instanceof Error ? error.message : 'Failed to load into engine',
      })
    }
    return false
  }
}
