import { useProjectStore } from '@/state/projectStore'
import {
  completeTableOperation,
  isTableOperationCurrent,
  updateTableOperation,
} from '@/state/runtime/tableOperationCoordinator'
import { cancelCanvasImportBatch, completeCanvasImportBatch } from '@/state/runtime/canvasImportBatchStore'
import { checkRowCount, checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import {
  discardPendingImport,
  fileBaseName,
  reservePendingImport,
} from '@/persistence/import-export/import/importLifecycle'
import { discardFiles, getTableCount } from '@/persistence/import-export/import/importUtils'
import { stageImportedTable } from '@/persistence/import-export/import/stageImportedTable'
import { uploadFileWithSync } from '@/persistence/sync/session/syncService'
import type { PendingImportItem, SelectionMode } from '@/persistence/import-export/import/useImportOrchestrator'

export interface SingleFileFlowContext {
  tier: Tier
  requireRemoteWhenOnline: boolean
  showViolation: (v: LimitExceeded) => void
  requireImportOwnership: () => void
  persistProjectNow: () => Promise<void>
  setIsImporting: (value: boolean) => void
  openSelectionModal: (items: PendingImportItem[], mode: SelectionMode) => void
}

export async function importSingleCsv(
  ctx: SingleFileFlowContext,
  file: File,
  projectId: string,
  uploadedFileIds: string[],
  onReserved?: () => void,
) {
  const nodes = useProjectStore.getState().nodes
  const tableCheck = checkTableCount(getTableCount(nodes), ctx.tier)
  if (!tableCheck.ok) {
    ctx.showViolation(tableCheck)
    return
  }

  // Validate before reserving a canvas node so rejected imports never linger as 0-row tables.
  const { inspectCSVFile } = await import('@/persistence/import-export/import/importParsers')
  const { schema, rows } = await inspectCSVFile(file)
  const rowCheck = checkRowCount(schema.rowCount ?? rows.length, ctx.tier)
  if (!rowCheck.ok) {
    ctx.showViolation(rowCheck)
    return
  }

  ctx.requireImportOwnership()
  const { tableId, generation, focusBatchId } = reservePendingImport(file)
  // Hand off to the node's progress UI so another import can start.
  onReserved?.()
  try {
    const isCurrentImport = () =>
      useProjectStore.getState().projectId === projectId
      && isTableOperationCurrent(tableId, generation)
    if (!isCurrentImport()) return

    // Stay on "reading" through upload to avoid a brief "saving" flash before engine load.
    updateTableOperation(tableId, generation, {
      progress: { completed: rows.length, total: rows.length, label: 'Rows parsed' },
    })
    const uploaded = await uploadFileWithSync(file, projectId, undefined, {
      requireRemoteWhenOnline: ctx.requireRemoteWhenOnline,
      deduplicate: true,
    })
    uploadedFileIds.push(uploaded.id)
    if (!isCurrentImport()) {
      discardPendingImport(tableId)
      await discardFiles(uploadedFileIds)
      uploadedFileIds.length = 0
      return
    }
    await stageImportedTable({
      name: fileBaseName(file.name),
      fileRef: uploaded.id,
      fileName: file.name,
      fileType: 'csv',
      schema,
      rows,
      engineError: 'The data engine did not initialize the imported table.',
      tableId,
      operationGeneration: generation,
      deferCompletion: true,
    })
    if (!isCurrentImport()) {
      discardPendingImport(tableId)
      await discardFiles(uploadedFileIds)
      uploadedFileIds.length = 0
      return
    }
    await ctx.persistProjectNow()
    if (completeTableOperation(tableId, generation)) {
      completeCanvasImportBatch(focusBatchId)
    }
    uploadedFileIds.length = 0
  } catch (error) {
    discardPendingImport(tableId)
    throw error
  } finally {
    cancelCanvasImportBatch(focusBatchId)
  }
}

export async function importSingleExcelFile(
  ctx: SingleFileFlowContext,
  file: File,
  projectId: string,
  uploadedFileIds: string[],
  pendingImportRef: { current: { tableId: string; generation: number; focusBatchId: string } | null },
) {
  // Validate before reserving a canvas node so rejected imports never linger as 0-row tables.
  const [{ inspectExcelFile }, { parseWorkbookSheet }] = await Promise.all([
    import('@/persistence/import-export/import/importParsers'),
    import('@/engine/parsing/fileParsers'),
  ])
  const { workbook, buffer, sheets } = await inspectExcelFile(file)
  if (sheets.length !== 1) {
    ctx.openSelectionModal(
      sheets.map((sheet) => ({
        id: `sheet:0:${file.name}:${sheet.name}`,
        kind: 'sheet' as const,
        label: sheet.name,
        tableName: sheet.name,
        rowCount: sheet.rowCount,
        selected: sheet.selected,
        sourceFileName: file.name,
        sheetName: sheet.name,
        workbook,
        buffer,
        sourceKey: `file:0:${file.name}`,
      })),
      'sheets',
    )
    return
  }

  const tableData = parseWorkbookSheet(workbook, sheets[0].name)
  const rowCheck = checkRowCount(tableData.schema.rowCount ?? tableData.rows.length, ctx.tier)
  if (!rowCheck.ok) {
    ctx.showViolation(rowCheck)
    return
  }
  ctx.requireImportOwnership()
  const pendingImport = reservePendingImport(file)
  pendingImportRef.current = pendingImport
  ctx.setIsImporting(false)
  const uploaded = await uploadFileWithSync(file, projectId, undefined, {
    requireRemoteWhenOnline: ctx.requireRemoteWhenOnline,
    deduplicate: true,
  })
  uploadedFileIds.push(uploaded.id)
  if (
    useProjectStore.getState().projectId !== projectId
    || !isTableOperationCurrent(pendingImport.tableId, pendingImport.generation)
  ) {
    throw new Error('The active project changed during import.')
  }
  updateTableOperation(pendingImport.tableId, pendingImport.generation, { phase: 'materializing' })
  await stageImportedTable({
    name: fileBaseName(file.name),
    fileRef: uploaded.id,
    fileName: file.name,
    fileType: 'xlsx',
    schema: tableData.schema,
    rows: tableData.rows,
    engineError: 'The data engine did not initialize the imported table.',
    tableId: pendingImport.tableId,
    operationGeneration: pendingImport.generation,
    deferCompletion: true,
  })
  await ctx.persistProjectNow()
  if (completeTableOperation(pendingImport.tableId, pendingImport.generation)) {
    completeCanvasImportBatch(pendingImport.focusBatchId)
  }
  uploadedFileIds.length = 0
  pendingImportRef.current = null
}
