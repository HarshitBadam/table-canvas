import { useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import * as Dialog from '@radix-ui/react-dialog'
import * as XLSX from 'xlsx'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import {
  SheetInfo,
  parseCSVFile,
  parseExcelFile,
  importSheetAndPersist,
  loadTableIntoEngine,
} from '@/persistence/importParsers'

export function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addSourceTable = useProjectStore((state) => state.addSourceTable)
  const setTableData = useDataStore((state) => state.setTableData)

  const [isImporting, setIsImporting] = useState(false)
  const [sheetModalOpen, setSheetModalOpen] = useState(false)
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [excelBuffer, setExcelBuffer] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState('')

  const handleClick = () => fileInputRef.current?.click()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setFileName(file.name)

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()

      if (extension === 'csv') {
        const { schema, rows, fileRef } = await parseCSVFile(file)
        const tableId = addSourceTable({
          name: file.name.replace(/\.[^/.]+$/, ''),
          fileRef,
          fileName: file.name,
          fileType: 'csv',
          schema,
        })
        setTableData(tableId, rows)
        loadTableIntoEngine(tableId, schema, rows)
      } else if (extension === 'xlsx' || extension === 'xls') {
        const result = await parseExcelFile(file)
        if (result.kind === 'single') {
          const { schema, rows } = result.tableData
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
        alert('Unsupported file type. Please use CSV or Excel files.')
      }
    } catch (error: unknown) {
      console.error('Import error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to import file: ${message}`)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImportSelectedSheets = async () => {
    if (!workbook) return

    for (const sheet of sheets.filter((s) => s.selected)) {
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
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-accent-green hover:bg-accent-green-hover rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

            <div className="px-3 pb-3">
              <div className="bg-surface-secondary rounded-lg overflow-hidden divide-y divide-border-subtle">
                {sheets.map((sheet, index) => (
                  <label
                    key={sheet.name}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-tertiary transition-colors"
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
    </>
  )
}
