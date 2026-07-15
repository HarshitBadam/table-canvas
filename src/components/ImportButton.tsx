import { useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import * as Dialog from '@radix-ui/react-dialog'
import type { WorkBook } from 'xlsx'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import { useAppAuth } from '@/state/AppContext'
import { checkFileSize, checkRowCount, checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import type { SheetInfo } from '@/persistence/importParsers'
import { loadTableIntoEngine } from '@/engine/loadTableIntoEngine'

function getTableCount(nodes: Record<string, { kind: string }>): number {
  return Object.values(nodes).filter(
    (n) => n.kind === 'source_table' || n.kind === 'derived_table',
  ).length
}

export function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addSourceTable = useProjectStore((state) => state.addSourceTable)
  const setTableData = useDataStore((state) => state.setTableData)
  const { user } = useAppAuth()

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

    const sizeCheck = checkFileSize(file.size, tier)
    if (!sizeCheck.ok) {
      showViolation(sizeCheck)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsImporting(true)
    setImportError(null)
    setFileName(file.name)

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()

      if (extension === 'csv') {
        const { parseCSVFile } = await import('@/persistence/importParsers')
        const nodes = useProjectStore.getState().nodes
        const tableCheck = checkTableCount(getTableCount(nodes), tier)
        if (!tableCheck.ok) {
          showViolation(tableCheck)
          return
        }

        const { schema, rows, fileRef } = await parseCSVFile(file)

        const rowCheck = checkRowCount(schema.rowCount ?? rows.length, tier)
        if (!rowCheck.ok) {
          showViolation(rowCheck)
          return
        }

        const tableId = addSourceTable({
          name: file.name.replace(/\.[^/.]+$/, ''),
          fileRef,
          fileName: file.name,
          fileType: 'csv',
          schema,
        })
        setTableData(tableId, rows)
        await loadTableIntoEngine(tableId, schema, rows)
      } else if (extension === 'xlsx' || extension === 'xls') {
        const { parseExcelFile } = await import('@/persistence/importParsers')
        const result = await parseExcelFile(file)
        if (result.kind === 'single') {
          const nodes = useProjectStore.getState().nodes
          const tableCheck = checkTableCount(getTableCount(nodes), tier)
          if (!tableCheck.ok) {
            showViolation(tableCheck)
            return
          }

          const { schema, rows } = result.tableData

          const rowCheck = checkRowCount(schema.rowCount ?? rows.length, tier)
          if (!rowCheck.ok) {
            showViolation(rowCheck)
            return
          }

          const tableId = addSourceTable({
            name: file.name.replace(/\.[^/.]+$/, ''),
            fileRef: result.fileRef,
            fileName: file.name,
            fileType: 'xlsx',
            schema,
          })
          setTableData(tableId, rows)
          await loadTableIntoEngine(tableId, schema, rows)
        } else {
          setSheets(result.sheets)
          setWorkbook(result.workbook)
          setExcelBuffer(result.buffer)
          setSheetModalOpen(true)
        }
      } else {
        setImportError('Unsupported file type. Please use CSV or Excel files.')
      }
    } catch (error: unknown) {
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
        showViolation(tableCheck)
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

      for (const sheet of selectedSheets) {
        const { tableData, fileRef } = await importSheetAndPersist(
          workbook, sheet.name, fileName, excelBuffer || undefined
        )

        const tableId = addSourceTable({
          name: sheet.name,
          fileRef,
          fileName,
          fileType: 'xlsx',
          sheetName: sheet.name,
          schema: tableData.schema,
        })
        setTableData(tableId, tableData.rows)
        await loadTableIntoEngine(tableId, tableData.schema, tableData.rows)
      }

      setSheetModalOpen(false)
      setWorkbook(null)
      setExcelBuffer(null)
      setSheets([])
    } catch (error) {
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
        accept=".csv,.xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={handleClick}
        disabled={isImporting}
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
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-xl shadow-2xl w-full max-w-sm z-50 overflow-hidden border border-border-elevation">
            <div className="px-5 pt-5 pb-3">
              <Dialog.Title className="text-base font-semibold text-text-primary">
                Select Sheets to Import
              </Dialog.Title>
              <Dialog.Description className="text-sm text-text-secondary mt-0.5">
                This file contains {sheets.length} sheets
              </Dialog.Description>
            </div>

            <div className="max-h-[min(60vh,30rem)] overflow-y-auto px-3 pb-3">
              <div className="space-y-2">
                {sheets.map((sheet, index) => (
                  <label
                    key={sheet.name}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-subtle bg-surface-secondary px-3 py-2.5 transition-[background-color,border-color,box-shadow] hover:border-border hover:bg-surface-tertiary focus-within:border-accent-green focus-within:ring-2 focus-within:ring-accent-green/20"
                  >
                    <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors ${
                      sheet.selected
                        ? 'bg-accent-green'
                        : 'border-2 border-border'
                    }`}>
                      {sheet.selected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={sheet.selected}
                      onChange={() => toggleSheet(index)}
                      className="sr-only"
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

            <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between bg-surface-secondary/50">
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
                  className="px-4 py-1.5 text-sm font-medium text-white bg-accent-green hover:bg-accent-green/90 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      />
    </>
  )
}
