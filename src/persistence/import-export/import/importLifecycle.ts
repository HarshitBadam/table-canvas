import { useProjectStore } from '@/state/projectStore'
import {
  beginCanvasImportBatch,
  registerCanvasImportNode,
} from '@/state/runtime/canvasImportBatchStore'
import { beginTableOperation } from '@/state/runtime/tableOperationCoordinator'
import type { TableSchema } from '@/types'

const PENDING_SCHEMA: TableSchema = { columns: [], rowCount: 0 }

export function fileExtension(fileName: string): string | undefined {
  return fileName.split('.').pop()?.toLowerCase()
}

export function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '')
}

export function isDataFile(file: File): boolean {
  const extension = fileExtension(file.name)
  return extension === 'csv' || extension === 'xlsx' || extension === 'xls'
}

export function reservePendingImport(
  file: Pick<File, 'name'>,
  // Optional display name: workbook sheets are not 1:1 with the source file name.
  options?: { name?: string; focusBatchId?: string; recordHistory?: boolean },
): { tableId: string; generation: number; focusBatchId: string } {
  const name = options?.name ?? fileBaseName(file.name)
  // Undo snapshot so a failed/incomplete reserve can be rolled back.
  if (options?.recordHistory !== false) {
    useProjectStore.getState().saveSnapshot(`Import table ${name}`)
  }
  const tableId = useProjectStore.getState().addSourceTable({
    name,
    fileRef: `pending:${crypto.randomUUID()}`,
    fileName: file.name,
    fileType: fileExtension(file.name) === 'csv' ? 'csv' : 'xlsx',
    schema: PENDING_SCHEMA,
    recordHistory: false,
  })
  const focusBatchId = options?.focusBatchId
    ?? beginCanvasImportBatch(useProjectStore.getState().projectId)
  registerCanvasImportNode(focusBatchId, tableId)
  return {
    tableId,
    generation: beginTableOperation(tableId, 'reading'),
    focusBatchId,
  }
}

export function discardPendingImport(tableId: string): void {
  if (useProjectStore.getState().nodes[tableId]) {
    useProjectStore.getState().deleteNode(tableId, { recordHistory: false })
  }
}
