import { useProjectStore } from '@/state/projectStore'
import { completeTableOperation, isTableOperationCurrent } from '@/state/runtime/tableOperationCoordinator'
import { beginCanvasImportBatch, cancelCanvasImportBatch, completeCanvasImportBatch } from '@/state/runtime/canvasImportBatchStore'
import { checkFileSize, checkRowCount, checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import {
  discardPendingImport,
  fileBaseName,
  fileExtension,
  reservePendingImport,
} from '@/persistence/import-export/import/importLifecycle'
import { discardFiles, getImportProcessingOrder, getTableCount } from '@/persistence/import-export/import/importUtils'
import { stageImportedTable } from '@/persistence/import-export/import/stageImportedTable'
import { uploadFileWithSync } from '@/persistence/sync/session/syncService'
import type { PendingImportItem, SelectionMode } from '@/persistence/import-export/import/useImportOrchestrator'

export interface SelectionFlowContext {
  tier: Tier
  requireRemoteWhenOnline: boolean
  showViolation: (v: LimitExceeded) => void
  requireImportOwnership: () => void
  persistProjectNow: () => Promise<void>
  setSelectionModalOpen: (open: boolean) => void
  clearSelectionState: () => void
}

async function buildPendingItemsFromFiles(files: File[]): Promise<PendingImportItem[]> {
  const { inspectCSVFile, inspectExcelFile } = await import('@/persistence/import-export/import/importParsers')

  const items: PendingImportItem[] = []
  for (const [fileIndex, file] of files.entries()) {
    const sourceKey = `file:${fileIndex}:${file.name}`
    const extension = fileExtension(file.name)
    if (extension === 'csv') {
      const tableData = await inspectCSVFile(file)
      const tableName = fileBaseName(file.name)
      items.push({
        id: `csv:${fileIndex}:${file.name}`,
        kind: 'csv',
        label: tableName,
        tableName,
        rowCount: tableData.schema.rowCount ?? tableData.rows.length,
        selected: true,
        file,
        tableData,
        sourceKey,
      })
      continue
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const { workbook, buffer, sheets } = await inspectExcelFile(file)
      const baseName = fileBaseName(file.name)
      for (const sheet of sheets) {
        items.push({
          id: `sheet:${fileIndex}:${file.name}:${sheet.name}`,
          kind: 'sheet',
          label: `${baseName} › ${sheet.name}`,
          tableName: sheet.name,
          rowCount: sheet.rowCount,
          selected: true,
          sourceFileName: file.name,
          sheetName: sheet.name,
          workbook,
          buffer,
          sourceKey,
        })
      }
    }
  }
  return items
}

export async function prepareMultiFileSelection(
  ctx: Pick<SelectionFlowContext, 'tier' | 'showViolation'>,
  files: File[],
  openSelectionModal: (items: PendingImportItem[], mode: SelectionMode) => void,
  setImportError: (message: string | null) => void,
): Promise<PendingImportItem[] | null> {
  for (const file of files) {
    const sizeCheck = checkFileSize(file.size, ctx.tier)
    if (!sizeCheck.ok) {
      ctx.showViolation(sizeCheck)
      return null
    }
  }

  try {
    const items = await buildPendingItemsFromFiles(files)
    if (items.length === 0) {
      setImportError('No importable tables found in the selected files.')
      return null
    }
    openSelectionModal(items, 'tables')
    return items
  } catch (error: unknown) {
    console.error('Multi-file inspect error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    setImportError(`Failed to read selected files: ${message}`)
    return null
  }
}

export async function importSelectedItems(
  ctx: SelectionFlowContext,
  selectedItemsInput: PendingImportItem[],
  selectionMode: SelectionMode,
  setImportError: (message: string | null) => void,
) {
  const selectedItems = getImportProcessingOrder(selectedItemsInput)
  if (selectedItems.length === 0) return

  const projectId = useProjectStore.getState().projectId
  const uploadedFileIds: string[] = []
  const reservedImports: Array<{ tableId: string; generation: number }> = []
  let focusBatchId: string | null = null

  try {
    const [
      { importSheetAndPersist },
      { parseWorkbookSheet },
    ] = await Promise.all([
      import('@/persistence/import-export/import/importParsers'),
      import('@/engine/parsing/fileParsers'),
    ])

    const nodes = useProjectStore.getState().nodes
    const currentTableCount = getTableCount(nodes)
    const unitLabel = selectionMode === 'sheets' ? 'sheet' : 'table'
    const unitLabelPlural = selectionMode === 'sheets' ? 'sheets' : 'tables'

    const tableCheck = checkTableCount(currentTableCount + selectedItems.length - 1, ctx.tier)
    if (!tableCheck.ok) {
      ctx.setSelectionModalOpen(false)
      ctx.clearSelectionState()
      ctx.showViolation({
        ...tableCheck,
        reason: `Importing ${selectedItems.length} ${selectedItems.length === 1 ? unitLabel : unitLabelPlural} would bring this project from ${currentTableCount} to ${currentTableCount + selectedItems.length} tables (limit: ${tableCheck.limit}).`,
      })
      return
    }

    for (const item of selectedItems) {
      if (item.kind === 'csv') {
        const rowCheck = checkRowCount(item.rowCount, ctx.tier)
        if (!rowCheck.ok) {
          ctx.setSelectionModalOpen(false)
          ctx.clearSelectionState()
          ctx.showViolation(rowCheck)
          return
        }
        continue
      }

      const tableData = parseWorkbookSheet(item.workbook, item.sheetName)
      const rowCheck = checkRowCount(tableData.schema.rowCount ?? tableData.rows.length, ctx.tier)
      if (!rowCheck.ok) {
        ctx.setSelectionModalOpen(false)
        ctx.clearSelectionState()
        ctx.showViolation(rowCheck)
        return
      }
    }

    useProjectStore.getState().saveSnapshot(
      selectionMode === 'sheets'
        ? `Import ${selectedItems.length} workbook sheets`
        : `Import ${selectedItems.length} tables`,
    )
    focusBatchId = beginCanvasImportBatch(projectId)

    // Close the checklist before the long loop so Importing… + pending nodes stay visible.
    ctx.setSelectionModalOpen(false)
    ctx.clearSelectionState()

    for (const item of selectedItems) {
      // Reserve before upload so another focused tab cannot take the write lease mid-flight.
      ctx.requireImportOwnership()
      const pendingImport = reservePendingImport(
        { name: item.kind === 'csv' ? item.file.name : item.sourceFileName },
        // Reserve with the staged name (sheet or CSV base) so the placeholder is correct immediately.
        { name: item.tableName, focusBatchId, recordHistory: false },
      )
      reservedImports.push(pendingImport)

      if (item.kind === 'csv') {
        const uploaded = await uploadFileWithSync(item.file, projectId, undefined, {
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

        await stageImportedTable({
          name: item.tableName,
          fileRef: uploaded.id,
          fileName: item.file.name,
          fileType: 'csv',
          schema: item.tableData.schema,
          rows: item.tableData.rows,
          engineError: `The data engine did not initialize table "${item.tableName}".`,
          tableId: pendingImport.tableId,
          operationGeneration: pendingImport.generation,
          deferCompletion: true,
        })
        continue
      }

      const { tableData, fileRef } = await importSheetAndPersist(
        item.workbook,
        item.sheetName,
        item.sourceFileName,
        projectId,
        item.buffer,
        { requireRemoteWhenOnline: ctx.requireRemoteWhenOnline, deduplicate: true },
      )
      uploadedFileIds.push(fileRef)
      if (
        useProjectStore.getState().projectId !== projectId
        || !isTableOperationCurrent(pendingImport.tableId, pendingImport.generation)
      ) {
        throw new Error('The active project changed during import.')
      }

      await stageImportedTable({
        name: item.tableName,
        fileRef,
        fileName: item.sourceFileName,
        fileType: 'xlsx',
        sheetName: item.sheetName,
        schema: tableData.schema,
        rows: tableData.rows,
        engineError: `The data engine did not initialize sheet "${item.sheetName}".`,
        tableId: pendingImport.tableId,
        operationGeneration: pendingImport.generation,
        deferCompletion: true,
      })
    }

    await ctx.persistProjectNow()
    const allOperationsCompleted = reservedImports
      .map(({ tableId, generation }) => completeTableOperation(tableId, generation))
      .every(Boolean)
    if (allOperationsCompleted) completeCanvasImportBatch(focusBatchId)
    uploadedFileIds.length = 0
  } catch (error) {
    reservedImports.forEach(({ tableId }) => {
      discardPendingImport(tableId)
    })
    await discardFiles(uploadedFileIds)
    console.error('Import selection error:', error)
    ctx.setSelectionModalOpen(false)
    ctx.clearSelectionState()
    setImportError(error instanceof Error ? error.message : 'Failed to import selected tables')
  } finally {
    if (focusBatchId) cancelCanvasImportBatch(focusBatchId)
  }
}
