export type { ToastNotification } from './types'
export { setToastHandler } from './types'

export { setRecipeWizardCallback, executeRecipeTransform } from './utilityCommands'

import type { Suggestion } from '@/types'
import type { SuggestionCommand, CommandResult, CommandExecutionOptions } from './types'
import { CreateDerivedTableCommand, ApplyPatchCommand } from './tableCommands'
import { CreateChartCommand } from './chartCommand'
import { HighlightCellsCommand, LaunchRecipeCommand } from './utilityCommands'
import { useSuggestionsStore } from '../suggestionsStore'

function createCommand(
  suggestion: Suggestion,
  options: CommandExecutionOptions,
): SuggestionCommand | null {
  const action = suggestion.action

  switch (action.kind) {
    case 'createDerivedTable':
      return new CreateDerivedTableCommand(suggestion, action, options)

    case 'createChart':
      return new CreateChartCommand(suggestion, action, options)

    case 'applyPatch':
      return new ApplyPatchCommand(suggestion, action, options)

    case 'launchRecipe':
      return new LaunchRecipeCommand(suggestion, action)

    case 'highlightCells':
      return new HighlightCellsCommand(suggestion, action)

    default:
      return null
  }
}

export async function applySuggestion(
  suggestion: Suggestion,
  options: CommandExecutionOptions = {},
): Promise<CommandResult> {
  if (suggestion.category === 'cleaning' && suggestion.context.cleaningOperation) {
    return {
      success: false,
      message: 'Review this fix in the table Cleaning tab before applying it.',
      error: 'Cleaning review required',
    }
  }

  const command = createCommand(suggestion, options)

  if (!command) {
    return {
      success: false,
      message: 'Could not create command for suggestion',
      error: 'Unknown action type',
    }
  }

  const result = await command.execute()
  if (result.success && suggestion.action.kind !== 'launchRecipe') {
    useSuggestionsStore.getState().consumeSuggestion(suggestion.id)
  }
  return result
}
