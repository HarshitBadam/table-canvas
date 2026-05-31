interface SuggestionsPanelHeaderProps {
  selectedColumnId?: string
  onClose: () => void
}

export function SuggestionsPanelHeader({ selectedColumnId, onClose }: SuggestionsPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Suggestions</h2>
        <p className="text-xs text-text-tertiary">
          {selectedColumnId ? 'For selected column' : 'For this table'}
        </p>
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-surface-secondary transition-colors"
        aria-label="Close suggestions panel"
      >
        <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
