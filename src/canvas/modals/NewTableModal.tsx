import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { generateId } from '@/lib/utils'
import { ColumnType, ColumnSchema, TableSchema, CellValue } from '@/lib/types'

interface NewTableModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ColumnConfig {
  id: string
  name: string
  type: ColumnType
}

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'date', label: 'Date' },
]

export function NewTableModal({ isOpen, onClose }: NewTableModalProps) {
  const addSourceTable = useProjectStore((state) => state.addSourceTable)
  const setTableData = useDataStore((state) => state.setTableData)
  
  const [tableName, setTableName] = useState('New Table')
  const [rowCount, setRowCount] = useState(5)
  const [columns, setColumns] = useState<ColumnConfig[]>([
    { id: generateId(), name: 'Name', type: 'string' },
    { id: generateId(), name: 'Value', type: 'number' },
  ])

  const addColumn = () => {
    setColumns([
      ...columns,
      { id: generateId(), name: `Column ${columns.length + 1}`, type: 'string' }
    ])
  }

  const removeColumn = (id: string) => {
    if (columns.length > 1) {
      setColumns(columns.filter(c => c.id !== id))
    }
  }

  const updateColumn = (id: string, updates: Partial<ColumnConfig>) => {
    setColumns(columns.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  const handleCreate = () => {
    // Build schema
    const schemaColumns: ColumnSchema[] = columns.map((col, index) => ({
      id: `col_${index}_${col.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: col.name,
      type: col.type,
      nullable: true,
    }))

    const schema: TableSchema = {
      columns: schemaColumns,
      rowCount: rowCount,
    }

    // Create empty rows
    const rows: TableRow[] = Array.from({ length: rowCount }, (_, rowIndex) => {
      const row: TableRow = { __rowId: `row_${rowIndex}` }
      schemaColumns.forEach(col => {
        row[col.id] = col.type === 'number' ? 0 : '' as CellValue
      })
      return row
    })

    // Add table to project store
    const tableId = addSourceTable({
      name: tableName,
      fileRef: '',
      fileName: '',
      fileType: 'csv',
      schema,
    })

    // Add data to data store
    setTableData(tableId, rows)

    // Reset form and close
    resetForm()
    onClose()
  }

  const resetForm = () => {
    setTableName('New Table')
    setRowCount(5)
    setColumns([
      { id: generateId(), name: 'Name', type: 'string' },
      { id: generateId(), name: 'Value', type: 'number' },
    ])
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-2xl shadow-2xl w-full max-w-md z-50 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-accent-green/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-text-primary">
                  Create New Table
                </Dialog.Title>
                <Dialog.Description className="text-sm text-text-tertiary">
                  Define your table structure
                </Dialog.Description>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-4 space-y-5">
            {/* Table Name */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Table Name
              </label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-transparent transition-shadow"
                placeholder="Enter table name"
              />
            </div>

            {/* Row Count */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Number of Rows
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={rowCount}
                  onChange={(e) => setRowCount(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-surface-secondary rounded-lg appearance-none cursor-pointer accent-accent-green"
                />
                <input
                  type="number"
                  value={rowCount}
                  onChange={(e) => setRowCount(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={1000}
                  className="w-20 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-transparent"
                />
              </div>
            </div>

            {/* Columns */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary">
                  Columns
                </label>
                <button
                  onClick={addColumn}
                  className="text-xs font-medium text-accent-green hover:text-accent-green/80 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Column
                </button>
              </div>
              
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {columns.map((col, index) => (
                  <div 
                    key={col.id} 
                    className="flex items-center gap-2 p-2.5 bg-surface-secondary/50 rounded-lg border border-border/50 group"
                  >
                    <span className="text-xs font-medium text-text-tertiary w-5 text-center">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                      className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green focus:border-transparent min-w-0"
                      placeholder="Column name"
                    />
                    <select
                      value={col.type}
                      onChange={(e) => updateColumn(col.id, { type: e.target.value as ColumnType })}
                      className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-green focus:border-transparent appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236e6e73'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px', paddingRight: '24px' }}
                    >
                      {COLUMN_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length <= 1}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-tertiary transition-colors"
                      title={columns.length <= 1 ? 'Must have at least one column' : 'Remove column'}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-surface-secondary/30 border-t border-border flex items-center justify-between">
            <div className="text-sm text-text-tertiary">
              {rowCount} row{rowCount !== 1 ? 's' : ''} × {columns.length} column{columns.length !== 1 ? 's' : ''}
            </div>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-lg transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button 
                onClick={handleCreate} 
                disabled={!tableName.trim() || columns.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Table
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
