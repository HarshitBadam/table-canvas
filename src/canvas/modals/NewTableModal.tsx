import { useState, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { useAppAuth } from '@/state/AppContext'
import { generateId } from '@/lib/utils'
import { ColumnType, ColumnSchema, TableSchema, CellValue } from '@/types'
import { checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { UpgradePrompt } from '@/components/UpgradePrompt'

interface NewTableModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ColumnConfig {
  id: string
  name: string
  type: ColumnType
}

const COLUMN_TYPES: { value: ColumnType; label: string; icon: string }[] = [
  { value: 'string', label: 'Text', icon: 'T' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'boolean', label: 'Yes/No', icon: '◉' },
  { value: 'date', label: 'Date', icon: '◷' },
]

function TypeDropdown({ 
  value, 
  onChange 
}: { 
  value: ColumnType
  onChange: (value: ColumnType) => void 
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  
  const selected = COLUMN_TYPES.find(t => t.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-text-secondary bg-surface-secondary hover:bg-surface-tertiary rounded transition-colors"
      >
        <span className="text-[10px] opacity-60">{selected?.icon}</span>
        <span>{selected?.label}</span>
        <svg className={`w-3 h-3 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface rounded-lg shadow-lg border border-border py-1 z-50 min-w-[110px]">
          {COLUMN_TYPES.map(type => (
            <button
              key={type.value}
              type="button"
              onClick={() => {
                onChange(type.value)
                setOpen(false)
              }}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-surface-secondary transition-colors ${
                value === type.value ? 'text-accent-green font-medium' : 'text-text-primary'
              }`}
            >
              <span className="opacity-50 w-3">{type.icon}</span>
              {type.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function NewTableModal({ isOpen, onClose }: NewTableModalProps) {
  const addSourceTable = useProjectStore((state) => state.addSourceTable)
  const nodes = useProjectStore((state) => state.nodes)
  const setTableData = useDataStore((state) => state.setTableData)
  const { user } = useAppAuth()
  
  const [tableName, setTableName] = useState('New Table')
  const [rowCount, setRowCount] = useState(5)
  const [columns, setColumns] = useState<ColumnConfig[]>([
    { id: generateId(), name: 'Name', type: 'string' },
    { id: generateId(), name: 'Value', type: 'number' },
  ])
  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

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
    const tier: Tier = user?.tier ?? 'guest'
    const currentTableCount = Object.values(nodes).filter(
      (n) => n.kind === 'source_table' || n.kind === 'derived_table',
    ).length
    const tableCheck = checkTableCount(currentTableCount, tier)
    if (!tableCheck.ok) {
      setUpgradeViolation(tableCheck)
      setUpgradeOpen(true)
      return
    }

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

    const rows: TableRow[] = Array.from({ length: rowCount }, (_, rowIndex) => {
      const row: TableRow = { __rowId: `row_${rowIndex}` }
      schemaColumns.forEach(col => {
        row[col.id] = col.type === 'number' ? 0 : '' as CellValue
      })
      return row
    })

    const tableId = addSourceTable({
      name: tableName,
      fileRef: '',
      fileName: '',
      fileType: 'csv',
      schema,
    })

    setTableData(tableId, rows)
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
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-xl shadow-2xl w-full max-w-md z-50 overflow-hidden border border-border-elevation">
          <div className="px-5 pt-5 pb-4 border-b border-border-subtle">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              Create New Table
            </Dialog.Title>
            <Dialog.Description className="text-sm text-text-secondary mt-0.5">
              Define columns and structure for your table
            </Dialog.Description>
          </div>

          <div className="px-5 py-4 space-y-5">
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
                Table Name
              </label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-surface-secondary border border-border rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-green focus:ring-1 focus:ring-accent-green/20"
                placeholder="Enter table name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
                Rows
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={rowCount}
                  onChange={(e) => setRowCount(parseInt(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-green [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent-green [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer bg-surface-tertiary"
                />
                <div className="w-14 px-2 py-1.5 text-sm bg-surface-secondary border border-border rounded-lg text-text-primary text-center font-medium">
                  {rowCount}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                  Columns
                </label>
                <button
                  onClick={addColumn}
                  className="text-xs font-medium text-accent-green hover:text-accent-green/80 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
              
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {columns.map((col, index) => (
                  <div 
                    key={col.id} 
                    className="flex items-center gap-2 p-2 bg-surface-secondary rounded-lg group"
                  >
                    <span className="text-xs text-text-tertiary w-5 text-center tabular-nums font-medium">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                      className="flex-1 px-2 py-1.5 text-sm bg-surface border border-border rounded text-text-primary focus:outline-none focus:border-accent-green min-w-0"
                      placeholder="Column name"
                    />
                    <TypeDropdown
                      value={col.type}
                      onChange={(type) => updateColumn(col.id, { type })}
                    />
                    <button
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length <= 1}
                      className="p-1.5 text-text-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-tertiary disabled:hover:bg-transparent transition-colors"
                      title={columns.length <= 1 ? 'Must have at least one column' : 'Remove'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-border-subtle flex items-center justify-between bg-surface-secondary/50">
            <span className="text-xs text-text-secondary">
              {rowCount} rows × {columns.length} columns
            </span>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button 
                onClick={handleCreate} 
                disabled={!tableName.trim() || columns.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green/90 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create Table
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <UpgradePrompt
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        violation={upgradeViolation}
      />
    </Dialog.Root>
  )
}
