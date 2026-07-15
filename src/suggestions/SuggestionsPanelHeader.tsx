import * as Dialog from '@radix-ui/react-dialog'

interface SuggestionsPanelHeaderProps {
  tableName: string
  selectedColumnName?: string
  onClose: () => void
}

export function SuggestionsPanelHeader({ tableName, selectedColumnName, onClose }: SuggestionsPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
      <div className="min-w-0">
        <Dialog.Title className="text-lg font-semibold text-text-primary">Suggestions</Dialog.Title>
        <p className="truncate text-xs text-text-tertiary">
          {selectedColumnName ? `${tableName} - ${selectedColumnName}` : tableName}
        </p>
      </div>
      <Dialog.Close
        asChild
      >
        <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
        aria-label="Close suggestions panel"
        >
          <svg aria-hidden="true" className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </Dialog.Close>
    </div>
  )
}
