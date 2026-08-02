import { loadTableIntoEngine } from '@/engine/loadTableIntoEngine'
import { useDataStore, type TableRow } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'
import {
  beginTableOperation,
  completeTableOperation,
  failTableOperation,
  updateTableOperation,
} from '@/state/tableOperationCoordinator'
import type { Position, SourceTableNode, TableSchema } from '@/types'

interface StageImportedTableOptions {
  name: string
  schema: TableSchema
  rows: TableRow[]
  fileRef: string
  fileName: string
  fileType: 'csv' | 'xlsx'
  sheetName?: string
  position?: Position
  engineError: string
  tableId?: string
  operationGeneration?: number
}

export async function stageImportedTable({
  name,
  schema,
  rows,
  fileRef,
  fileName,
  fileType,
  sheetName,
  position,
  engineError,
  tableId: existingTableId,
  operationGeneration,
}: StageImportedTableOptions): Promise<string> {
  const tableId = existingTableId ?? useProjectStore.getState().addSourceTable({
    name,
    schema,
    fileRef,
    fileName,
    fileType,
    sheetName,
    position,
    recordHistory: false,
  })
  if (existingTableId) {
    const node = useProjectStore.getState().getTableNode(existingTableId)
    if (!node || node.kind !== 'source_table') {
      throw new Error('The pending imported table no longer exists.')
    }
    useProjectStore.getState().updateNode(existingTableId, {
      schema,
      plan: {
        fileRef,
        fileName,
        fileType,
        sheetName,
        inferredSchemaVersion: 1,
      },
    } as Partial<SourceTableNode>)
  }
  const generation = operationGeneration ?? beginTableOperation(tableId, 'materializing')
  updateTableOperation(tableId, generation, { phase: 'materializing' })
  useDataStore.getState().setTableData(tableId, [])
  try {
    const loaded = await loadTableIntoEngine(tableId, schema, rows)
    if (!loaded) {
      throw new Error(engineError)
    }
    completeTableOperation(tableId, generation)
    return tableId
  } catch (error) {
    const message = error instanceof Error ? error.message : engineError
    failTableOperation(tableId, generation, message)
    throw error instanceof Error ? error : new Error(message)
  }
}
