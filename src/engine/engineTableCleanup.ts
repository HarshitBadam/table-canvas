import { useProjectStore } from '@/state/projectStore'
import { getEngine } from './EngineAdapter'
import { enqueueEngineMutation } from './materializationCoordinator'
import { ensureTableMaterialized } from './materializationService'

export async function dropEngineTables(
  tableIds: string[],
  options: { onlyIfDeleted?: boolean } = {},
): Promise<void> {
  const projectId = useProjectStore.getState().projectId
  const restoredTableIds: string[] = []
  await enqueueEngineMutation(async () => {
    for (const tableId of tableIds) {
      if (options.onlyIfDeleted && useProjectStore.getState().getTableNode(tableId)) continue
      try {
        await getEngine().dropTable(tableId)
        if (options.onlyIfDeleted && useProjectStore.getState().getTableNode(tableId)) {
          restoredTableIds.push(tableId)
        }
      } catch (error) {
        console.error(`[MaterializationService] Failed to drop table ${tableId}:`, error)
      }
    }
  })
  if (useProjectStore.getState().projectId === projectId) {
    await Promise.all(restoredTableIds.map(tableId => ensureTableMaterialized(tableId)))
  }
}
