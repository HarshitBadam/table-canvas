import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { ColumnSchema, ColumnType, TableSchema, CellValue } from '@/lib/types'
import { generateId, readFileAsText, readFileAsArrayBuffer, inferValueType } from '@/lib/utils'
import { getEngine } from '@/engine'
import { saveFile } from '@/persistence/db'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// Helper to load table data into the DuckDB engine and mark as fresh
async function loadTableIntoEngine(
  tableId: string,
  schema: TableSchema,
  rows: TableRow[]
): Promise<boolean> {
  try {
    const engine = getEngine()
    await engine.init() // Ensure engine is ready
    await engine.loadTable(tableId, schema, rows)
    
    // Mark the table as fresh (not dirty) after successful load
    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      lastRowCount: rows.length,
      error: undefined,
    })
    
    console.log(`[Import] Table ${tableId} loaded into engine and marked as fresh`)
    return true
  } catch (error) {
    console.error('[Import] Failed to load table into engine:', error)
    // Mark error state
    useProjectStore.getState().updateCacheInfo(tableId, {
      isDirty: true,
      isComputing: false,
      error: error instanceof Error ? error.message : 'Failed to load into engine',
    })
    return false
  }
}

interface SheetInfo {
  name: string
  rowCount: number
  selected: boolean
}

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

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setFileName(file.name)

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()

      if (extension === 'csv') {
        await importCSV(file)
      } else if (extension === 'xlsx' || extension === 'xls') {
        await handleExcelFile(file)
      } else {
        alert('Unsupported file type. Please use CSV or Excel files.')
      }
    } catch (error: unknown) {
      console.error('Import error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to import file: ${message}`)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const importCSV = async (file: File) => {
    const text = await readFileAsText(file)
    const buffer = await readFileAsArrayBuffer(file)
    
    return new Promise<void>((resolve, reject) => {
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors)
          }

          const { schema, rows } = processData(results.data, results.meta.fields || [])
          
          // Generate fileRef and save file blob to IndexedDB
          const fileRef = generateId()
          await saveFile(fileRef, file.name, file.type || 'text/csv', buffer)
          
          const tableId = addSourceTable({
            name: file.name.replace(/\.[^/.]+$/, ''),
            fileRef,
            fileName: file.name,
            fileType: 'csv',
            schema,
          })

          setTableData(tableId, rows)
          
          loadTableIntoEngine(tableId, schema, rows).then(() => {
            resolve()
          }).catch(() => {
            resolve()
          })
        },
        error: (error: Error) => {
          reject(error)
        },
      })
    })
  }

  const handleExcelFile = async (file: File) => {
    const buffer = await readFileAsArrayBuffer(file)
    const wb = XLSX.read(buffer, { type: 'array' })
    
    if (wb.SheetNames.length === 1) {
      await importExcelSheet(wb, wb.SheetNames[0], file.name, buffer)
    } else {
      const sheetInfos: SheetInfo[] = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name]
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
        const rowCount = range.e.r - range.s.r
        return { name, rowCount, selected: true }
      })
      
      setSheets(sheetInfos)
      setWorkbook(wb)
      setExcelBuffer(buffer)
      setSheetModalOpen(true)
    }
  }

  const importExcelSheet = async (wb: XLSX.WorkBook, sheetName: string, fName: string, fileBuffer?: ArrayBuffer) => {
    const sheet = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    
    if (data.length === 0) return

    const headerRow = data[0] as unknown[]
    const headers = headerRow.map((h, i) => String(h || `Column ${i + 1}`))
    const dataRows = data.slice(1).map((row) => {
      const rowArr = row as unknown[]
      const obj: Record<string, string> = {}
      headers.forEach((header, i) => {
        obj[header] = String(rowArr[i] ?? '')
      })
      return obj
    })

    const { schema, rows } = processData(dataRows, headers)
    
    // Generate fileRef and save file blob to IndexedDB if buffer provided
    const fileRef = generateId()
    if (fileBuffer) {
      await saveFile(fileRef, fName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileBuffer)
    }
    
    const tableId = addSourceTable({
      name: sheetName,
      fileRef,
      fileName: fName,
      fileType: 'xlsx',
      sheetName,
      schema,
    })

    setTableData(tableId, rows)
    await loadTableIntoEngine(tableId, schema, rows)
  }

  const handleImportSelectedSheets = async () => {
    if (!workbook) return

    const selectedSheets = sheets.filter((s) => s.selected)
    for (const sheet of selectedSheets) {
      await importExcelSheet(workbook, sheet.name, fileName, excelBuffer || undefined)
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
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
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

      {/* Sheet Selection Modal */}
      <Dialog.Root open={sheetModalOpen} onOpenChange={setSheetModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 animate-fade-in z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-xl shadow-xl w-full max-w-md animate-scale-in z-50">
            <div className="p-6">
              <Dialog.Title className="text-lg font-semibold text-text-primary mb-1">
                Select Sheets to Import
              </Dialog.Title>
              <Dialog.Description className="text-sm text-text-secondary mb-4">
                This Excel file contains multiple sheets. Select which ones to import.
              </Dialog.Description>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sheets.map((sheet, index) => (
                  <label
                    key={sheet.name}
                    className="flex items-center gap-3 p-3 rounded-lg bg-surface-secondary hover:bg-surface-tertiary cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={sheet.selected}
                      onChange={() => toggleSheet(index)}
                      className="w-4 h-4 rounded border-border text-accent-green focus:ring-accent-green"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {sheet.name}
                      </div>
                      <div className="text-xs text-text-tertiary">
                        ~{sheet.rowCount} rows
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Dialog.Close asChild>
                <button className="btn btn-secondary">Cancel</button>
              </Dialog.Close>
              <button
                onClick={handleImportSelectedSheets}
                disabled={!sheets.some((s) => s.selected)}
                className="btn btn-primary"
              >
                Import {sheets.filter((s) => s.selected).length} Sheet(s)
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

// Helper function to process parsed data into schema and rows
function processData(
  data: Record<string, string>[],
  fields: string[]
): { schema: TableSchema; rows: TableRow[] } {
  const columns: ColumnSchema[] = fields.map((field, index) => {
    const columnId = `col_${index}_${field.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    const sampleValues = data.slice(0, 100).map((row) => row[field]).filter(Boolean)
    const inferredType = inferColumnType(sampleValues)
    const hasNulls = data.some((row) => row[field] === '' || row[field] === null || row[field] === undefined)
    
    return {
      id: columnId,
      name: field,
      type: inferredType,
      nullable: hasNulls,
    }
  })

  const rows: TableRow[] = data.map((row, index) => {
    const rowId = `row_${index}`
    const rowData: TableRow = { __rowId: rowId }
    
    columns.forEach((col, colIndex) => {
      const field = fields[colIndex]
      let value: CellValue = row[field]
      
      if (col.type === 'number' && value !== '' && value !== null) {
        const num = parseFloat(String(value).replace(/,/g, ''))
        value = isNaN(num) ? value : num
      } else if (col.type === 'boolean') {
        const lower = String(value).toLowerCase()
        if (lower === 'true' || lower === '1' || lower === 'yes') value = true
        else if (lower === 'false' || lower === '0' || lower === 'no') value = false
      }
      
      rowData[col.id] = value
    })
    
    return rowData
  })

  const schema: TableSchema = {
    columns,
    rowCount: rows.length,
  }

  return { schema, rows }
}

function inferColumnType(values: string[]): ColumnType {
  if (values.length === 0) return 'string'

  const types = values.map((v) => inferValueType(v))
  const counts: Record<string, number> = {}
  types.forEach((t) => {
    counts[t] = (counts[t] || 0) + 1
  })

  delete counts['null']
  
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return 'string'

  for (const [type, count] of Object.entries(counts)) {
    if (count / total > 0.8) {
      return type as ColumnType
    }
  }

  return 'string'
}
