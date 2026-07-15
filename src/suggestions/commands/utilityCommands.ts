import { useProjectStore } from '@/state/projectStore'
import type {
  Suggestion,
  SuggestionAction,
  TransformDef,
} from '@/types'
import type { SuggestionCommand, CommandResult, CommandExecutionOptions } from './types'
import { showToast } from './types'

export class HighlightCellsCommand implements SuggestionCommand {
  private suggestion: Suggestion
  private action: Extract<SuggestionAction, { kind: 'highlightCells' }>

  constructor(
    suggestion: Suggestion,
    action: Extract<SuggestionAction, { kind: 'highlightCells' }>
  ) {
    this.suggestion = suggestion
    this.action = action
  }

  async execute(): Promise<CommandResult> {
    const store = useProjectStore.getState()
    const tableId = this.suggestion.context.tableId
    const sourceTable = store.getTableNode(tableId)

    if (!sourceTable) {
      return {
        success: false,
        message: 'Table not found',
        error: 'Table not found',
      }
    }

    try {
      store.setHighlights(tableId, this.action.cells)

      const cellCount = this.action.cells.length
      showToast({
        type: 'success',
        message: `Highlighted ${cellCount} cell${cellCount !== 1 ? 's' : ''} for review`,
      })

      return {
        success: true,
        message: `Highlighted ${cellCount} cell${cellCount !== 1 ? 's' : ''} for review`,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      showToast({
        type: 'error',
        message: `Failed to highlight cells: ${errorMessage}`,
      })
      return {
        success: false,
        message: 'Failed to highlight cells',
        error: errorMessage,
      }
    }
  }

  getDescription(): string {
    return `Highlight cells: "${this.suggestion.title}"`
  }
}

let recipeWizardCallback: ((suggestion: Suggestion) => void) | null = null

export function setRecipeWizardCallback(callback: ((suggestion: Suggestion) => void) | null): void {
  recipeWizardCallback = callback
}

export class LaunchRecipeCommand implements SuggestionCommand {
  private suggestion: Suggestion
  private action: Extract<SuggestionAction, { kind: 'launchRecipe' }>

  constructor(
    suggestion: Suggestion,
    action: Extract<SuggestionAction, { kind: 'launchRecipe' }>
  ) {
    this.suggestion = suggestion
    this.action = action
  }

  async execute(): Promise<CommandResult> {
    if (recipeWizardCallback) {
      recipeWizardCallback(this.suggestion)
      return {
        success: true,
        message: `Opening recipe wizard for "${this.action.recipeId}"`,
      }
    }

    showToast({
      type: 'info',
      message: `Recipe "${this.suggestion.title}" is being configured...`,
    })

    return {
      success: true,
      message: `Recipe "${this.action.recipeId}" wizard opened`,
    }
  }

  getDescription(): string {
    return `Launch recipe: "${this.suggestion.title}"`
  }
}

export async function executeRecipeTransform(
  transform: TransformDef,
  tableName: string,
  sourceTableId: string,
  options: CommandExecutionOptions = {},
): Promise<CommandResult> {
  const store = useProjectStore.getState()

  try {
    const upstreamNodeIds = 'leftTableId' in transform
      ? [transform.leftTableId, transform.rightTableId]
      : 'sourceTableIds' in transform
        ? transform.sourceTableIds
        : 'sourceTableId' in transform
          ? [transform.sourceTableId]
          : [sourceTableId]

    const nodeId = store.addDerivedTable({
      name: tableName,
      transformDef: transform,
      upstreamNodeIds: [...new Set(upstreamNodeIds)],
    })

    showToast({
      type: 'success',
      message: `Created "${tableName}"`,
      action: {
        label: 'View',
        onClick: () => {
          if (options.navigateToNode) {
            options.navigateToNode(nodeId, 'table')
          } else {
            useProjectStore.getState().selectNode(nodeId)
          }
        },
      },
    })

    return {
      success: true,
      message: `Created "${tableName}"`,
      createdNodeId: nodeId,
      createdNodeName: tableName,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    showToast({
      type: 'error',
      message: `Failed to create recipe output: ${errorMessage}`,
    })
    return {
      success: false,
      message: 'Failed to execute recipe',
      error: errorMessage,
    }
  }
}
