import * as Dialog from '@radix-ui/react-dialog'

interface SuggestionsPanelHeaderProps {
  tableName: string
  selectedColumnName?: string
}

export function SuggestionsPanelHeader({ tableName, selectedColumnName }: SuggestionsPanelHeaderProps) {
  return (
    <div className="px-4 pb-2 pt-4">
      <div className="min-w-0">
        <Dialog.Title className="text-lg font-semibold text-text-primary">Suggestions</Dialog.Title>
        <p className="truncate text-xs text-text-tertiary">
          {selectedColumnName ? `${selectedColumnName} in ${tableName}` : tableName}
        </p>
      </div>
    </div>
  )
}
