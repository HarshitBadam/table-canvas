export type { SuggestionCommand, CommandResult, ToastType, ToastNotification } from './types'
export { setToastHandler, showToast } from './types'

export { CreateDerivedTableCommand } from './tableCommands'
export { ApplyPatchCommand } from './tableCommands'

export { CreateChartCommand } from './chartCommand'

export { HighlightCellsCommand } from './utilityCommands'
export { LaunchRecipeCommand } from './utilityCommands'
export { setRecipeWizardCallback, executeRecipeTransform } from './utilityCommands'

import type { Suggestion } from '@/types'
import type { SuggestionCommand, CommandResult } from './types'
import { CreateDerivedTableCommand } from './tableCommands'
import { CreateChartCommand } from './chartCommand'
import { ApplyPatchCommand } from './tableCommands'
import { HighlightCellsCommand, LaunchRecipeCommand } from './utilityCommands'

export function createCommand(suggestion: Suggestion): SuggestionCommand | null {
  const action = suggestion.action

  switch (action.kind) {
    case 'createDerivedTable':
      return new CreateDerivedTableCommand(suggestion, action)

    case 'createChart':
      return new CreateChartCommand(suggestion, action)

    case 'applyPatch':
      return new ApplyPatchCommand(suggestion, action)

    case 'launchRecipe':
      return new LaunchRecipeCommand(suggestion, action)

    case 'highlightCells':
      return new HighlightCellsCommand(suggestion, action)

    default:
      return null
  }
}

export async function applySuggestion(suggestion: Suggestion): Promise<CommandResult> {
  const command = createCommand(suggestion)

  if (!command) {
    return {
      success: false,
      message: 'Could not create command for suggestion',
      error: 'Unknown action type',
    }
  }

  return command.execute()
}
