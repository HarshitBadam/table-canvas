import { getEngine } from './EngineAdapter'
import {
  computePatchesVersion,
  computeSourceVersionHash,
} from './cacheUtils'
import { useProjectStore } from '@/state/projectStore'
import type { TableRow } from '@/state/dataStore'
import type { CellValue, Patches, TableSchema } from '@/types'

export async function loadEngineTable(
  tableId: string,
  schema: TableSchema,
  rows: Record<string, CellValue>[],
  patches?: Patches,
): Promise<void> {
  const engine = getEngine()
  await engine.init()
  await engine.loadTable(tableId, schema, rows, patches)
}

export async function loadTableIntoEngine(
  tableId: string,
  schema: TableSchema,
  rows: TableRow[],
): Promise<boolean> {
  try {
    const node = useProjectStore.getState().getTableNode(tableId)
    const patches = useProjectStore.getState().patches[tableId]
    await loadEngineTable(tableId, schema, rows, patches)
    const fileRef = node?.kind === 'source_table' ? node.plan.fileRef : undefined
    const currentVersionHash = computeSourceVersionHash(
      tableId,
      fileRef ?? '',
      computePatchesVersion(patches),
    )

    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      lastRowCount: rows.length,
      currentVersionHash,
      error: undefined,
    })
    return true
  } catch (error) {
    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: true,
      isComputing: false,
      error: error instanceof Error ? error.message : 'Failed to load into engine',
    })
    return false
  }
}
