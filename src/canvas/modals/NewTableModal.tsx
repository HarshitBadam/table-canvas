import { useState, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { useAppAuth } from '@/state/AppContext'
import { generateId } from '@/lib/utils'
import { ColumnType, ColumnSchema, TableSchema } from '@/types'
import { checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { loadTableIntoEngine } from '@/engine/loadTableIntoEngine'
import { getVisibleFocusableElement, isVisibleElement } from '@/components/useDialogFocus'
import { ColumnTypeDropdown } from './ColumnTypeDropdown'

interface NewTableModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ColumnConfig {
  id: string
  name: string
  type: ColumnType
}

const MAX_TABLE_NAME_LENGTH = 100
const MAX_COLUMN_NAME_LENGTH = 100

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
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const creatingRef = useRef(false)

  useEffect(() => {
    if (isOpen && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = isVisibleElement(document.activeElement)
        ? document.activeElement
        : null
    }
  }, [isOpen])
  const trimmedColumnNames = columns.map(column => column.name.trim())
  const tableNameError = tableName.trim() ? null : 'Enter a table name.'
  const hasEmptyColumnName = trimmedColumnNames.some(name => name.length === 0)
  const hasDuplicateColumnName =
    new Set(trimmedColumnNames.map(name => name.toLocaleLowerCase())).size
    !== trimmedColumnNames.length
  const columnError = hasEmptyColumnName
    ? 'Every column needs a name.'
    : hasDuplicateColumnName
      ? 'Give each column a different name.'
      : null

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

  const handleCreate = async () => {
    if (creatingRef.current || tableNameError || columnError) return

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
      name: col.name.trim(),
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
        row[col.id] = null
      })
      return row
    })

    creatingRef.current = true
    setIsCreating(true)
    setCreateError(null)
    let tableId: string | null = null

    try {
      tableId = addSourceTable({
        name: tableName.trim(),
        fileRef: '',
        fileName: '',
        fileType: 'csv',
        schema,
        initialRows: rows,
      })
      setTableData(tableId, rows)
      const loaded = await loadTableIntoEngine(tableId, schema, rows)
      if (!loaded) {
        throw new Error('The data engine did not initialize the table.')
      }
      resetForm()
      onClose()
    } catch (error) {
      if (tableId) {
        useProjectStore.getState().deleteNode(tableId)
        useDataStore.getState().clearTableData(tableId)
      }
      console.error('[NewTableModal] Failed to create table:', error)
      setCreateError('We could not create the table. Try again.')
    } finally {
      creatingRef.current = false
      setIsCreating(false)
    }
  }

  const resetForm = () => {
    setTableName('New Table')
    setRowCount(5)
    setColumns([
      { id: generateId(), name: 'Name', type: 'string' },
      { id: generateId(), name: 'Value', type: 'number' },
    ])
    setCreateError(null)
  }

  const handleClose = () => {
    if (creatingRef.current) return
    resetForm()
    onClose()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="join-overlay z-50" />
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            handleClose()
          }}
          onCloseAutoFocus={(event) => {
            const returnFocusElement = returnFocusRef.current && isVisibleElement(returnFocusRef.current)
              ? returnFocusRef.current
              : getVisibleFocusableElement()
            if (!returnFocusElement) return
            event.preventDefault()
            returnFocusElement.focus()
            returnFocusRef.current = null
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border-elevation bg-surface shadow-2xl sm:max-w-md"
        >
          <div className="border-b border-border-subtle px-4 py-4 sm:px-6">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              Create New Table
            </Dialog.Title>
            <Dialog.Description className="text-sm text-text-secondary mt-0.5">
              Name the table, choose its columns, and set the starting row count.
            </Dialog.Description>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:px-6">
            <div>
              <label
                htmlFor="new-table-name"
                className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2"
              >
                Table Name
              </label>
              <input
                id="new-table-name"
                type="text"
                value={tableName}
                onChange={(e) => {
                  setTableName(e.target.value)
                  setCreateError(null)
                }}
                maxLength={MAX_TABLE_NAME_LENGTH}
                aria-invalid={Boolean(tableNameError)}
                aria-describedby={tableNameError ? 'new-table-name-error' : undefined}
                className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus-visible:border-accent-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/20"
                placeholder="Enter table name"
              />
              {tableNameError && (
                <p id="new-table-name-error" className="mt-1.5 text-xs text-red-600" role="alert">
                  {tableNameError}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="new-table-rows"
                className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2"
              >
                Rows
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="new-table-rows"
                  type="range"
                  min={1}
                  max={100}
                  value={rowCount}
                  onChange={(e) => setRowCount(parseInt(e.target.value))}
                  aria-valuetext={`${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent-green [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-green [&::-webkit-slider-thumb]:shadow-sm"
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
                  type="button"
                  onClick={addColumn}
                  className="canvas-touch-target flex items-center gap-1 rounded text-xs font-medium text-accent-text transition-colors hover:text-accent-text/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add column
                </button>
              </div>
              
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {columns.map((col, index) => (
                  <div
                    key={col.id} 
                    className="group flex flex-wrap items-center gap-2 rounded-lg bg-surface-secondary p-2 sm:flex-nowrap"
                  >
                    <span className="text-xs text-text-tertiary w-5 text-center tabular-nums font-medium">
                      {index + 1}
                    </span>
                    <input
                      id={`new-table-column-${index}`}
                      type="text"
                      aria-label={`Column ${index + 1} name`}
                      value={col.name}
                      onChange={(e) => {
                        updateColumn(col.id, { name: e.target.value })
                        setCreateError(null)
                      }}
                      maxLength={MAX_COLUMN_NAME_LENGTH}
                      aria-invalid={Boolean(columnError)}
                      aria-describedby={columnError ? 'new-table-column-error' : undefined}
                      className="min-w-36 flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary focus-visible:border-accent-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/20"
                      placeholder="Column name"
                    />
                    <ColumnTypeDropdown
                      value={col.type}
                      onChange={(type) => updateColumn(col.id, { type })}
                      ariaLabel={`Column ${index + 1} type`}
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length <= 1}
                      aria-label={`Remove ${col.name || `column ${index + 1}`}`}
                      className="canvas-touch-target rounded p-1.5 text-text-tertiary transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-tertiary dark:hover:bg-red-900/20"
                      title={columns.length <= 1 ? 'A table needs at least one column' : `Remove ${col.name || `column ${index + 1}`}`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              {columnError && (
                <p id="new-table-column-error" className="mt-2 text-xs text-red-600" role="alert">
                  {columnError}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-secondary/50 p-4 sm:px-6">
            <div>
              <span className="text-xs text-text-secondary">
                {rowCount} rows × {columns.length} columns
              </span>
              {createError && (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {createError}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isCreating}
                  className="canvas-touch-target rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={isCreating || !tableName.trim() || columns.length === 0 || Boolean(columnError)}
                className="canvas-touch-target rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isCreating ? 'Creating…' : 'Create Table'}
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
