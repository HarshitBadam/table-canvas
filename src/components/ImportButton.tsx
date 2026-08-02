import { useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import * as Dialog from '@radix-ui/react-dialog'
import type { WorkBook } from 'xlsx'
import { useProjectStore } from '@/state/projectStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import { beginHistoryTransaction, commitHistoryTransaction, rollbackHistoryTransaction } from '@/state/historyTransaction'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease'
import { checkFileSize, checkRowCount, checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import type { SheetInfo } from '@/persistence/importParsers'
import { discardFiles, getTableCount } from '@/persistence/importUtils'
import { stageImportedTable } from '@/persistence/stageImportedTable'

export function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAppAuth()
  const { importProject } = useApp()
  const { canEdit } = useWorkspaceLease()

  const [isImporting, setIsImporting] = useState(false)
  const [sheetModalOpen, setSheetModalOpen] = useState(false)
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [workbook, setWorkbook] = useState<WorkBook | null>(null)
  const [excelBuffer, setExcelBuffer] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const tier: Tier = user?.tier ?? 'guest'

  const showViolation = (v: LimitExceeded) => {
    setUpgradeViolation(v)
    setUpgradeOpen(true)
  }

  const handleClick = () => fileInputRef.current?.click()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase()

    if (extension === 'json' || extension === 'zip') {
      setIsImporting(true)
      setImportError(null)
      setFileName(file.name)
      try {
        const { parseImportFile } = await import('@/persistence/exportImport')
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

    setIsImporting(true)
    setImportError(null)
    setFileName(file.name)
    const projectId = useProjectStore.getState().projectId
    const uploadedFileIds: string[] = []
    let transactionId: string | null = null

    try {
      if (extension === 'csv') {
        const { parseCSVFile } = await import('@/persistence/importParsers')
        const nodes = useProjectStore.getState().nodes
        const tableCheck = checkTableCount(getTableCount(nodes), tier)
        if (!tableCheck.ok) {
          showViolation(tableCheck)
          return
        }

        const { schema, rows, fileRef } = await parseCSVFile(file, projectId)
        uploadedFileIds.push(fileRef)

        const rowCheck = checkRowCount(schema.rowCount ?? rows.length, tier)
        if (!rowCheck.ok) {
          await discardFiles(uploadedFileIds)
          showViolation(rowCheck)
          return
        }
        if (useProjectStore.getState().projectId !== projectId) {
          throw new Error('The active project changed during import.')
        }
        transactionId = beginHistoryTransaction(`Import table ${file.name}`)

        await stageImportedTable({
          name: file.name.replace(/\.[^/.]+$/, ''),
          fileRef,
          fileName: file.name,
          fileType: 'csv',
          schema,
          rows,
          engineError: 'The data engine did not initialize the imported table.',
        })
        commitHistoryTransaction(transactionId)
        transactionId = null
        uploadedFileIds.length = 0
      } else if (extension === 'xlsx' || extension === 'xls') {
        const { parseExcelFile } = await import('@/persistence/importParsers')
        const result = await parseExcelFile(file, projectId)
        if (result.kind === 'single') {
          uploadedFileIds.push(result.fileRef)
          if (useProjectStore.getState().projectId !== projectId) {
            throw new Error('The active project changed during import.')
          }
          const nodes = useProjectStore.getState().nodes
          const tableCheck = checkTableCount(getTableCount(nodes), tier)
          if (!tableCheck.ok) {
            await discardFiles(uploadedFileIds)
            showViolation(tableCheck)
            return
          }

          const { schema, rows } = result.tableData

          const rowCheck = checkRowCount(schema.rowCount ?? rows.length, tier)
          if (!rowCheck.ok) {
            await discardFiles(uploadedFileIds)
            showViolation(rowCheck)
            return
          }
          transactionId = beginHistoryTransaction(`Import table ${file.name}`)

          await stageImportedTable({
            name: file.name.replace(/\.[^/.]+$/, ''),
            fileRef: result.fileRef,
            fileName: file.name,
            fileType: 'xlsx',
            schema,
            rows,
            engineError: 'The data engine did not initialize the imported table.',
          })
          commitHistoryTransaction(transactionId)
          transactionId = null
          uploadedFileIds.length = 0
        } else {
          setSheets(result.sheets)
          setWorkbook(result.workbook)
          setExcelBuffer(result.buffer)
          setSheetModalOpen(true)
        }
      } else {
        setImportError('Unsupported file type. Please use a CSV, Excel, or TableCanvas project file.')
      }
    } catch (error: unknown) {
      rollbackHistoryTransaction(transactionId)
      await discardFiles(uploadedFileIds)
      console.error('Import error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setImportError(`Failed to import file: ${message}`)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImportSelectedSheets = async () => {
    if (!workbook) return

    setIsImporting(true)
    setImportError(null)
    const projectId = useProjectStore.getState().projectId
    const uploadedFileIds: string[] = []
    let transactionId: string | null = null
    try {
      const [
        { importSheetAndPersist },
        { parseWorkbookSheet },
      ] = await Promise.all([
        import('@/persistence/importParsers'),
        import('@/engine/fileParsers'),
      ])
      const selectedSheets = sheets.filter((s) => s.selected)
      const nodes = useProjectStore.getState().nodes
      const currentTableCount = getTableCount(nodes)

      const tableCheck = checkTableCount(currentTableCount + selectedSheets.length - 1, tier)
      if (!tableCheck.ok) {
        setSheetModalOpen(false)
        showViolation({
          ...tableCheck,
          reason: `Importing ${selectedSheets.length} ${selectedSheets.length === 1 ? 'sheet' : 'sheets'} would bring this project from ${currentTableCount} to ${currentTableCount + selectedSheets.length} tables (limit: ${tableCheck.limit}).`,
        })
        return
      }

      for (const sheet of selectedSheets) {
        const tableData = parseWorkbookSheet(workbook, sheet.name)
        const rowCheck = checkRowCount(tableData.schema.rowCount ?? tableData.rows.length, tier)
        if (!rowCheck.ok) {
          showViolation(rowCheck)
          return
        }
      }

      transactionId = beginHistoryTransaction(
        `Import ${selectedSheets.length} workbook sheets`,
      )

      for (const sheet of selectedSheets) {
        const { tableData, fileRef } = await importSheetAndPersist(
          workbook,
          sheet.name,
          fileName,
          projectId,
          excelBuffer || undefined,
        )
        uploadedFileIds.push(fileRef)
        if (useProjectStore.getState().projectId !== projectId) {
          throw new Error('The active project changed during import.')
        }

        await stageImportedTable({
          name: sheet.name,
          fileRef,
          fileName,
          fileType: 'xlsx',
          sheetName: sheet.name,
          schema: tableData.schema,
          rows: tableData.rows,
          engineError: `The data engine did not initialize sheet "${sheet.name}".`,
        })
      }
      commitHistoryTransaction(transactionId)
      transactionId = null
      uploadedFileIds.length = 0

      setSheetModalOpen(false)
      setWorkbook(null)
      setExcelBuffer(null)
      setSheets([])
    } catch (error) {
      rollbackHistoryTransaction(transactionId)
      await discardFiles(uploadedFileIds)
      console.error('Workbook import error:', error)
      setImportError(
        error instanceof Error ? error.message : 'Failed to import workbook',
      )
    } finally {
      setIsImporting(false)
    }
  }

  const toggleSheet = (index: number) => {
    setSheets((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    )
  }

  const selectedCount = sheets.filter((s) => s.selected).length

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
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

      <Dialog.Root open={sheetModalOpen} onOpenChange={setSheetModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/45 backdrop-blur-[2px] motion-safe:animate-fade-in" />
          <Dialog.Content className="fixed inset-0 z-modal m-auto h-fit w-[min(25.5rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border-elevation bg-surface shadow-2xl motion-safe:animate-scale-in">
            <div className="flex flex-col items-start border-b border-border-subtle px-5 pb-4 pt-5 text-left">
              <Dialog.Title className="text-base font-semibold text-text-primary">
                Select Sheets to Import
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-text-secondary">
                This file contains {sheets.length} sheets
              </Dialog.Description>
            </div>

            <div className="max-h-[min(60vh,30rem)] overflow-y-auto">
              <div className="divide-y divide-border-subtle">
                {sheets.map((sheet, index) => (
                  <label
                    key={sheet.name}
                    className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      sheet.selected
                        ? 'border-accent-green bg-accent-green'
                        : 'border-border bg-surface'
                    }`}>
                      {sheet.selected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={sheet.selected}
                      onChange={() => toggleSheet(index)}
                      className="sr-only focus-visible:!outline-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {sheet.name}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {sheet.rowCount} rows
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
                  onClick={handleImportSelectedSheets}
                  disabled={selectedCount === 0}
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
        layer={sheetModalOpen ? 'nested' : 'base'}
      />
    </>
  )
}
