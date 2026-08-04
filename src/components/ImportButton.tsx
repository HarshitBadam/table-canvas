import { useRef, useState } from 'react'
import { LoadingSpinner } from '@/layout/LoadingSpinner'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import * as Dialog from '@radix-ui/react-dialog'
import type { WorkBook } from 'xlsx'
import { useProjectStore } from '@/state/projectStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import {
  completeTableOperation,
  isTableOperationCurrent,
  updateTableOperation,
} from '@/state/runtime/tableOperationCoordinator'
import { holdsWriteLease } from '@/state/document/documentLease'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/document/useWorkspaceLease'
import { checkFileSize, checkRowCount, checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import {
  discardPendingImport,
  fileBaseName,
  fileExtension,
  isDataFile,
  reservePendingImport,
} from '@/persistence/import-export/import/importLifecycle'
import { discardFiles, getImportProcessingOrder, getTableCount } from '@/persistence/import-export/import/importUtils'
import { stageImportedTable } from '@/persistence/import-export/import/stageImportedTable'
import type { ParsedTableData } from '@/engine/parsing/fileParsers'
import { uploadFileWithSync } from '@/persistence/sync/session/syncService'

interface PendingImportBase {
  id: string
  label: string
  tableName: string
  rowCount: number
  selected: boolean
  /** Groups sheets from one workbook (or a standalone CSV) so processing never interleaves files. */
  sourceKey: string
}

type PendingImportItem =
  | (PendingImportBase & {
      kind: 'csv'
      file: File
      tableData: ParsedTableData
    })
  | (PendingImportBase & {
      kind: 'sheet'
      sourceFileName: string
      sheetName: string
      workbook: WorkBook
      buffer: ArrayBuffer
    })

type SelectionMode = 'sheets' | 'tables'

export function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAppAuth()
  const { importProject, persistProjectNow } = useApp()
  const { canEdit } = useWorkspaceLease()

  const [isImporting, setIsImporting] = useState(false)
  const [selectionModalOpen, setSelectionModalOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('sheets')
  const [pendingItems, setPendingItems] = useState<PendingImportItem[]>([])
  const [importError, setImportError] = useState<string | null>(null)

  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const tier: Tier = user?.tier ?? 'guest'
  const requireRemoteWhenOnline = tier !== 'guest'

  const showViolation = (v: LimitExceeded) => {
    setUpgradeViolation(v)
    setUpgradeOpen(true)
  }

  const requireImportOwnership = () => {
    if (holdsWriteLease()) return
    throw new Error('Editing moved to another tab during import. Return to this tab and try again.')
  }

  const clearSelectionState = () => {
    setPendingItems([])
    setSelectionMode('sheets')
  }

  const handleSelectionModalOpenChange = (open: boolean) => {
    setSelectionModalOpen(open)
    if (!open) clearSelectionState()
  }

  const handleClick = () => fileInputRef.current?.click()

  const importSingleCsv = async (
    file: File,
    projectId: string,
    uploadedFileIds: string[],
    onReserved?: () => void,
  ) => {
    const nodes = useProjectStore.getState().nodes
    const tableCheck = checkTableCount(getTableCount(nodes), tier)
    if (!tableCheck.ok) {
      showViolation(tableCheck)
      return
    }

    // Validate before reserving a canvas node so rejected imports never linger as 0-row tables.
    const { inspectCSVFile } = await import('@/persistence/import-export/import/importParsers')
    const { schema, rows } = await inspectCSVFile(file)
    const rowCheck = checkRowCount(schema.rowCount ?? rows.length, tier)
    if (!rowCheck.ok) {
      showViolation(rowCheck)
      return
    }

    requireImportOwnership()
    const { tableId, generation } = reservePendingImport(file)
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
        requireRemoteWhenOnline,
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
      await persistProjectNow()
      completeTableOperation(tableId, generation)
      uploadedFileIds.length = 0
    } catch (error) {
      discardPendingImport(tableId)
      throw error
    }
  }

  const buildPendingItemsFromFiles = async (files: File[]): Promise<PendingImportItem[]> => {
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

  const openSelectionModal = (items: PendingImportItem[], mode: SelectionMode) => {
    setPendingItems(items)
    setSelectionMode(mode)
    setSelectionModalOpen(true)
  }

  const prepareMultiFileSelection = async (files: File[]) => {
    for (const file of files) {
      const sizeCheck = checkFileSize(file.size, tier)
      if (!sizeCheck.ok) {
        showViolation(sizeCheck)
        return
      }
    }

    setIsImporting(true)
    setImportError(null)
    try {
      const items = await buildPendingItemsFromFiles(files)
      if (items.length === 0) {
        setImportError('No importable tables found in the selected files.')
        return
      }
      openSelectionModal(items, 'tables')
    } catch (error: unknown) {
      console.error('Multi-file inspect error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setImportError(`Failed to read selected files: ${message}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    if (files.length > 1) {
      if (!files.every(isDataFile)) {
        setImportError('To import multiple files at once, select only CSV or Excel files.')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      await prepareMultiFileSelection(files)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const file = files[0]
    const extension = fileExtension(file.name)

    if (extension === 'json' || extension === 'zip') {
      setIsImporting(true)
      setImportError(null)
      try {
        const { parseImportFile } = await import('@/persistence/import-export/import/exportImport')
        const parsed = await parseImportFile(file)
        await importProject({
          name: parsed.name,
          nodes: parsed.nodes,
          edges: parsed.edges,
          patches: parsed.patches,
          reports: parsed.reports,
        })
      } catch (error: unknown) {
        console.error('Project import error:', error)
        const limitError =
          typeof error === 'object' && error !== null && 'code' in error
            && error.code === 'limit'
        if (limitError) return
        const message = error instanceof Error ? error.message : 'Unknown error'
        setImportError(`Failed to import project: ${message}`)
      } finally {
        setIsImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      return
    }

    const sizeCheck = checkFileSize(file.size, tier)
    if (!sizeCheck.ok) {
      showViolation(sizeCheck)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const tableCheck = checkTableCount(getTableCount(useProjectStore.getState().nodes), tier)
    if (!tableCheck.ok) {
      showViolation(tableCheck)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsImporting(true)
    setImportError(null)
    const projectId = useProjectStore.getState().projectId
    const uploadedFileIds: string[] = []
    let pendingImport: { tableId: string; generation: number } | null = null

    try {
      if (extension === 'csv') {
        await importSingleCsv(file, projectId, uploadedFileIds, () => setIsImporting(false))
      } else if (extension === 'xlsx' || extension === 'xls') {
        // Validate before reserving a canvas node so rejected imports never linger as 0-row tables.
        const [{ inspectExcelFile }, { parseWorkbookSheet }] = await Promise.all([
          import('@/persistence/import-export/import/importParsers'),
          import('@/engine/parsing/fileParsers'),
        ])
        const { workbook, buffer, sheets } = await inspectExcelFile(file)
        if (sheets.length === 1) {
          const tableData = parseWorkbookSheet(workbook, sheets[0].name)
          const rowCheck = checkRowCount(
            tableData.schema.rowCount ?? tableData.rows.length,
            tier,
          )
          if (!rowCheck.ok) {
            showViolation(rowCheck)
            return
          }
          requireImportOwnership()
          pendingImport = reservePendingImport(file)
          setIsImporting(false)
          const uploaded = await uploadFileWithSync(file, projectId, undefined, {
            requireRemoteWhenOnline,
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
          await persistProjectNow()
          completeTableOperation(pendingImport.tableId, pendingImport.generation)
          uploadedFileIds.length = 0
          pendingImport = null
        } else {
          openSelectionModal(
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
        }
      } else {
        setImportError('Unsupported file type. Please use a CSV, Excel, or TableCanvas project file.')
      }
    } catch (error: unknown) {
      if (pendingImport) discardPendingImport(pendingImport.tableId)
      await discardFiles(uploadedFileIds)
      console.error('Import error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setImportError(`Failed to import file: ${message}`)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImportSelectedItems = async () => {
    // Size-ordered within each source file; never interleave items across files.
    const selectedItems = getImportProcessingOrder(pendingItems.filter((item) => item.selected))
    if (selectedItems.length === 0) return

    setIsImporting(true)
    setImportError(null)
    const projectId = useProjectStore.getState().projectId
    const uploadedFileIds: string[] = []
    const reservedImports: Array<{ tableId: string; generation: number }> = []

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

      const tableCheck = checkTableCount(currentTableCount + selectedItems.length - 1, tier)
      if (!tableCheck.ok) {
        setSelectionModalOpen(false)
        clearSelectionState()
        showViolation({
          ...tableCheck,
          reason: `Importing ${selectedItems.length} ${selectedItems.length === 1 ? unitLabel : unitLabelPlural} would bring this project from ${currentTableCount} to ${currentTableCount + selectedItems.length} tables (limit: ${tableCheck.limit}).`,
        })
        return
      }

      for (const item of selectedItems) {
        if (item.kind === 'csv') {
          const rowCheck = checkRowCount(item.rowCount, tier)
          if (!rowCheck.ok) {
            setSelectionModalOpen(false)
            clearSelectionState()
            showViolation(rowCheck)
            return
          }
          continue
        }

        const tableData = parseWorkbookSheet(item.workbook, item.sheetName)
        const rowCheck = checkRowCount(tableData.schema.rowCount ?? tableData.rows.length, tier)
        if (!rowCheck.ok) {
          setSelectionModalOpen(false)
          clearSelectionState()
          showViolation(rowCheck)
          return
        }
      }

      useProjectStore.getState().saveSnapshot(
        selectionMode === 'sheets'
          ? `Import ${selectedItems.length} workbook sheets`
          : `Import ${selectedItems.length} tables`,
      )

      // Close the checklist before the long loop so Importing… + pending nodes stay visible.
      setSelectionModalOpen(false)
      clearSelectionState()

      for (const item of selectedItems) {
        // Reserve before upload so another focused tab cannot take the write lease mid-flight.
        requireImportOwnership()
        const pendingImport = reservePendingImport(
          { name: item.kind === 'csv' ? item.file.name : item.sourceFileName },
          // Reserve with the staged name (sheet or CSV base) so the placeholder is correct immediately.
          { name: item.tableName },
        )
        reservedImports.push(pendingImport)

        if (item.kind === 'csv') {
          const uploaded = await uploadFileWithSync(item.file, projectId, undefined, {
            requireRemoteWhenOnline,
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
          { requireRemoteWhenOnline, deduplicate: true },
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

      await persistProjectNow()
      reservedImports.forEach(({ tableId, generation }) => {
        completeTableOperation(tableId, generation)
      })
      uploadedFileIds.length = 0
    } catch (error) {
      reservedImports.forEach(({ tableId }) => {
        discardPendingImport(tableId)
      })
      await discardFiles(uploadedFileIds)
      console.error('Import selection error:', error)
      setSelectionModalOpen(false)
      clearSelectionState()
      setImportError(
        error instanceof Error ? error.message : 'Failed to import selected tables',
      )
    } finally {
      setIsImporting(false)
    }
  }

  const toggleItem = (index: number) => {
    setPendingItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    )
  }

  const selectedCount = pendingItems.filter((item) => item.selected).length
  const selectionTitle = selectionMode === 'sheets' ? 'Select Sheets to Import' : 'Select Tables to Import'
  const selectionDescription = selectionMode === 'sheets'
    ? `This file contains ${pendingItems.length} sheets`
    : `${pendingItems.length} tables from selected files`

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.json,.tablecanvas.json,.zip,.tablecanvas.zip"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={handleClick}
        disabled={isImporting || !canEdit}
        title={canEdit ? undefined : EDITING_ELSEWHERE_TOOLTIP}
        className="btn btn-primary w-full gap-2"
      >
        {isImporting ? (
          <>
            <LoadingSpinner size="sm" />
            Importing...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import Data
          </>
        )}
      </button>
      {importError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {importError}
        </p>
      )}

      <Dialog.Root open={selectionModalOpen} onOpenChange={handleSelectionModalOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/45 backdrop-blur-[2px] motion-safe:animate-fade-in" />
          <Dialog.Content className="fixed inset-0 z-modal m-auto h-fit w-[min(25.5rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border-elevation bg-surface shadow-2xl motion-safe:animate-scale-in">
            <div className="flex flex-col items-start border-b border-border-subtle px-5 pb-4 pt-5 text-left">
              <Dialog.Title className="text-base font-semibold text-text-primary">
                {selectionTitle}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-text-secondary">
                {selectionDescription}
              </Dialog.Description>
            </div>

            <div className="max-h-[min(60vh,30rem)] overflow-y-auto">
              <div className="divide-y divide-border-subtle">
                {pendingItems.map((item, index) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      item.selected
                        ? 'border-accent-green bg-accent-green'
                        : 'border-border bg-surface'
                    }`}>
                      {item.selected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItem(index)}
                      className="sr-only focus-visible:!outline-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {item.label}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {item.rowCount} rows
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border-subtle bg-surface-secondary/50 px-5 py-3">
              <span className="text-sm text-text-secondary">
                {selectedCount} selected
              </span>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <button className="px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleImportSelectedItems}
                  disabled={selectedCount === 0 || isImporting}
                  className="btn btn-primary px-4"
                >
                  Import
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <UpgradePrompt
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        violation={upgradeViolation}
        layer={selectionModalOpen ? 'nested' : 'base'}
      />
    </>
  )
}
