import { loadTableIntoEngine } from '@/engine/loadTableIntoEngine'
import { useDataStore, type TableRow } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'
import type { Position, TableSchema } from '@/types'

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
}: StageImportedTableOptions): Promise<string> {
  const tableId = useProjectStore.getState().addSourceTable({
    name,
    schema,
    fileRef,
    fileName,
    fileType,
    sheetName,
    position,
    recordHistory: false,
  })
  useDataStore.getState().setTableData(tableId, rows)
  const loaded = await loadTableIntoEngine(tableId, schema, rows)
  if (!loaded) throw new Error(engineError)
  return tableId
}
