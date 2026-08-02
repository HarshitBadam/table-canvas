import { useProjectStore } from '@/state/projectStore'
import { beginTableOperation } from '@/state/tableOperationCoordinator'
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
): { tableId: string; generation: number } {
  const name = fileBaseName(file.name)
  // Snapshot the pre-import project so undo can remove a failed/incomplete reserve.
  useProjectStore.getState().saveSnapshot(`Import table ${name}`)
  const tableId = useProjectStore.getState().addSourceTable({
    name,
    fileRef: `pending:${crypto.randomUUID()}`,
    fileName: file.name,
    fileType: fileExtension(file.name) === 'csv' ? 'csv' : 'xlsx',
    schema: PENDING_SCHEMA,
    recordHistory: false,
  })
  return { tableId, generation: beginTableOperation(tableId, 'reading') }
}

export function discardPendingImport(tableId: string): void {
  if (useProjectStore.getState().nodes[tableId]) {
    useProjectStore.getState().deleteNode(tableId, { recordHistory: false })
  }
}
