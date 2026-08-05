import * as Dialog from '@radix-ui/react-dialog'
import type { PendingImportItem, SelectionMode } from '@/persistence/import-export/import/useImportOrchestrator'

interface ImportSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingItems: PendingImportItem[]
  selectionMode: SelectionMode
  isImporting: boolean
  onToggleItem: (index: number) => void
  onImport: () => void
}

export function ImportSelectionDialog({
  open,
  onOpenChange,
  pendingItems,
  selectionMode,
  isImporting,
  onToggleItem,
  onImport,
}: ImportSelectionDialogProps) {
  const selectedCount = pendingItems.filter((item) => item.selected).length
  const selectionTitle = selectionMode === 'sheets' ? 'Select Sheets to Import' : 'Select Tables to Import'
  const selectionDescription = selectionMode === 'sheets'
    ? `This file contains ${pendingItems.length} sheets`
    : `${pendingItems.length} tables from selected files`

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
                    onChange={() => onToggleItem(index)}
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
                onClick={onImport}
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
  )
}
