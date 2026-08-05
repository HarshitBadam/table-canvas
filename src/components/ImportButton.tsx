import { LoadingSpinner } from '@/layout/LoadingSpinner'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { ImportSelectionDialog } from '@/components/ImportSelectionDialog'
import { EDITING_ELSEWHERE_TOOLTIP } from '@/state/document/useWorkspaceLease'
import { useImportOrchestrator } from '@/persistence/import-export/import/useImportOrchestrator'

export function ImportButton() {
  const {
    fileInputRef,
    canEdit,
    isImporting,
    importError,
    selectionModalOpen,
    selectionMode,
    pendingItems,
    upgradeViolation,
    upgradeOpen,
    setUpgradeOpen,
    handleClick,
    handleFileSelect,
    handleSelectionModalOpenChange,
    handleImportSelectedItems,
    toggleItem,
  } = useImportOrchestrator()

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

      <ImportSelectionDialog
        open={selectionModalOpen}
        onOpenChange={handleSelectionModalOpenChange}
        pendingItems={pendingItems}
        selectionMode={selectionMode}
        isImporting={isImporting}
        onToggleItem={toggleItem}
        onImport={handleImportSelectedItems}
      />

      <UpgradePrompt
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        violation={upgradeViolation}
        layer={selectionModalOpen ? 'nested' : 'base'}
      />
    </>
  )
}
