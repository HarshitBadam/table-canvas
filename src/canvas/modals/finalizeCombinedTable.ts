import { getEngine } from '@/engine/EngineAdapter'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { checkRowCount, checkTransformOutputSafety } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import {
  completeTableOperation,
  failTableOperation,
  isTableOperationCurrent,
  updateTableOperation,
  waitForTableOperation,
} from '@/state/tableOperationCoordinator'

export async function finalizeCombinedTable(
  tableId: string,
  generation: number,
  tier: Tier,
  upstreamIds: string[],
): Promise<void> {
  try {
    for (const upstreamId of upstreamIds) {
      await waitForTableOperation(upstreamId)
      if (!isTableOperationCurrent(tableId, generation)) return
    }
    updateTableOperation(tableId, generation, { phase: 'materializing' })
    const result = await ensureTableMaterialized(tableId)
    if (!isTableOperationCurrent(tableId, generation)) return
    if (result.status === 'error') {
      failTableOperation(
        tableId,
        generation,
        result.error || 'The table could not be computed.',
      )
      return
    }
    const outputRows = result.rowCount ?? 0
    const safetyCheck = checkTransformOutputSafety(outputRows)
    const rowCheck = safetyCheck.ok ? checkRowCount(outputRows, tier) : safetyCheck
    if (!rowCheck.ok) {
      try {
        await getEngine().dropTable(tableId)
      } catch {
        // Keep the node in an error state even if engine cleanup fails.
      }
      failTableOperation(tableId, generation, rowCheck.reason)
      return
    }
    completeTableOperation(tableId, generation)
  } catch (error) {
    if (!isTableOperationCurrent(tableId, generation)) return
    failTableOperation(
      tableId,
      generation,
      error instanceof Error ? error.message : 'The combined table could not be created.',
    )
  }
}
