import { useProjectStore } from '@/state/projectStore'
import type { TableRow } from '@/state/dataStore'
import { getEngine } from './EngineAdapter'
import { ensureTableMaterialized } from './materializationService'
import {
  captureMaterializationScope,
  isMaterializationScopeCurrent,
} from './materializationCoordinator'

const STALE_DATA_ERROR = 'Table data changed while loading. Please try again.'

export async function getTableData(
  tableId: string,
  offset = 0,
  limit = 1000,
): Promise<{ rows: TableRow[]; totalRows: number; error?: string }> {
  const projectId = useProjectStore.getState().projectId
  const scope = captureMaterializationScope(projectId)
  const result = await ensureTableMaterialized(tableId)
  if (result.status === 'error') {
    return { rows: [], totalRows: 0, error: result.error }
  }
  if (
    result.status === 'loading'
    || !isMaterializationScopeCurrent(scope, useProjectStore.getState().projectId)
  ) {
    return { rows: [], totalRows: 0, error: STALE_DATA_ERROR }
  }

  try {
    const node = useProjectStore.getState().getTableNode(tableId)
    const slice = await getEngine().getSlice(
      tableId,
      offset,
      limit,
      node?.schema?.columns,
    )
    if (!isMaterializationScopeCurrent(scope, useProjectStore.getState().projectId)) {
      return { rows: [], totalRows: 0, error: STALE_DATA_ERROR }
    }
    const rows = slice.rows.map((row, index) => ({
      ...row,
      __rowId: row.__rowId as string || `row_${offset + index}`,
    })) as TableRow[]
    return { rows, totalRows: slice.totalRows }
  } catch (error) {
    return {
      rows: [],
      totalRows: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
