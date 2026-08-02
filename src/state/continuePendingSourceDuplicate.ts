import { ensureTableMaterialized } from '@/engine/materializationService'
import type { SourceTableNode } from '@/types'
import { useProjectStore } from './projectStore'
import { useTableRuntimeStore } from './tableRuntimeStore'
import {
  completeTableOperation,
  failTableOperation,
  updateTableOperation,
  waitForTableOperation,
} from './tableOperationCoordinator'

export async function continuePendingSourceDuplicate(
  sourceId: string,
  duplicateId: string,
  generation: number,
): Promise<void> {
  await waitForTableOperation(sourceId)
  const state = useProjectStore.getState()
  const source = state.nodes[sourceId]
  const duplicate = state.nodes[duplicateId]
  if (source?.kind !== 'source_table' || duplicate?.kind !== 'source_table') {
    failTableOperation(duplicateId, generation, 'The source import was cancelled before this copy was ready.')
    return
  }
  const sourceError = useTableRuntimeStore.getState().cacheInfo[sourceId]?.error
  if (sourceError) {
    failTableOperation(duplicateId, generation, `The source import failed: ${sourceError}`)
    return
  }
  state.updateNode(duplicateId, {
    schema: source.schema,
    plan: structuredClone(source.plan),
  } as Partial<SourceTableNode>)
  updateTableOperation(duplicateId, generation, { phase: 'materializing' })
  const result = await ensureTableMaterialized(duplicateId)
  if (result.status === 'error') {
    failTableOperation(duplicateId, generation, result.error || 'The copied table could not be loaded.')
    return
  }
  completeTableOperation(duplicateId, generation)
}
