/**
 * Suggestion Commands
 * Command pattern implementation for applying suggestions with undo/redo support
 */

import { useProjectStore } from '@/state/projectStore'
import type { 
  Suggestion, 
  SuggestionAction, 
  ChartNode,
  ChartPlan,
  Position,
  TransformDef,
  CleaningOperation,
} from '@/lib/types'
import { generateId } from '@/lib/utils'
import { PLACEHOLDER_VALUES } from '../cleaningConstants'

// ============================================================================
// Command Interface
// ============================================================================

export interface SuggestionCommand {
  execute(): Promise<CommandResult>
  getDescription(): string
}

export interface CommandResult {
  success: boolean
  message: string
  createdNodeId?: string
  createdNodeName?: string
  error?: string
}

// ============================================================================
// Toast notification helper (will be called by UI)
// ============================================================================

export type ToastType = 'success' | 'error' | 'info'

export interface ToastNotification {
  type: ToastType
  message: string
  action?: {
    label: string
    onClick: () => void
  }
}

// Global toast handler - will be set by UI
let toastHandler: ((toast: ToastNotification) => void) | null = null

export function setToastHandler(handler: (toast: ToastNotification) => void): void {
  toastHandler = handler
}

export function showToast(toast: ToastNotification): void {
  if (toastHandler) {
    toastHandler(toast)
  }
}

// ============================================================================
// Create Derived Table Command
// ============================================================================

/**
 * Get source table ID from a transform definition
 */
function getSourceTableId(transform: { sourceTableId?: string; leftTableId?: string; sourceTableIds?: string[] }): string | null {
  if ('sourceTableId' in transform && transform.sourceTableId) {
    return transform.sourceTableId
  }
  if ('leftTableId' in transform && transform.leftTableId) {
    return transform.leftTableId
  }
  if ('sourceTableIds' in transform && transform.sourceTableIds && transform.sourceTableIds.length > 0) {
    return transform.sourceTableIds[0]
  }
  return null
}

export class CreateDerivedTableCommand implements SuggestionCommand {
  private suggestion: Suggestion
  private action: Extract<SuggestionAction, { kind: 'createDerivedTable' }>

  constructor(
    suggestion: Suggestion,
    action: Extract<SuggestionAction, { kind: 'createDerivedTable' }>
  ) {
    this.suggestion = suggestion
    this.action = action
  }

  async execute(): Promise<CommandResult> {
    const store = useProjectStore.getState()
    const sourceTableId = getSourceTableId(this.action.transform as { sourceTableId?: string; leftTableId?: string; sourceTableIds?: string[] })
    
    if (!sourceTableId) {
      return {
        success: false,
        message: 'Could not determine source table',
        error: 'Missing source table ID in transform',
      }
    }
    
    const sourceTable = store.getTableNode(sourceTableId)
    
    if (!sourceTable) {
      return {
        success: false,
        message: 'Source table not found',
        error: 'Source table not found',
      }
    }

    // Determine table name
    const tableName = this.action.tableName ?? `${sourceTable.name} (transformed)`

    try {
      // Create the derived table
      const nodeId = store.addDerivedTable({
        name: tableName,
        transformDef: this.action.transform,
        upstreamNodeIds: [sourceTableId],
        position: this.calculatePosition(sourceTable.ui.position),
      })

      // Show success toast
      showToast({
        type: 'success',
        message: `Created "${tableName}"`,
        action: this.action.openAfterApply ? {
          label: 'Open',
          onClick: () => {
            store.selectNode(nodeId)
          },
        } : undefined,
      })

      // Auto-select if requested
      if (this.action.openAfterApply) {
        store.selectNode(nodeId)
      }

      return {
        success: true,
        message: `Created derived table "${tableName}"`,
        createdNodeId: nodeId,
        createdNodeName: tableName,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      showToast({
        type: 'error',
        message: `Failed to create table: ${errorMessage}`,
      })
      return {
        success: false,
        message: 'Failed to create derived table',
        error: errorMessage,
      }
    }
  }

  getDescription(): string {
    return `Create derived table from "${this.suggestion.title}"`
  }

  private calculatePosition(sourcePosition: Position): Position {
    return {
      x: sourcePosition.x + 300,
      y: sourcePosition.y,
    }
  }
}

// ============================================================================
// Create Chart Command
// ============================================================================

export class CreateChartCommand implements SuggestionCommand {
  private suggestion: Suggestion
  private action: Extract<SuggestionAction, { kind: 'createChart' }>

  constructor(
    suggestion: Suggestion,
    action: Extract<SuggestionAction, { kind: 'createChart' }>
  ) {
    this.suggestion = suggestion
    this.action = action
  }

  async execute(): Promise<CommandResult> {
    const store = useProjectStore.getState()
    const sourceTableId = this.action.chart.sourceTableId
    const sourceTable = store.getTableNode(sourceTableId)
    
    if (!sourceTable) {
      return {
        success: false,
        message: 'Source table not found',
        error: 'Source table not found',
      }
    }

    const chartTitle = this.action.chart.title ?? this.suggestion.title

    try {
      // Create the chart node
      const nodeId = generateId()
      const now = new Date().toISOString()
      
      const chartNode: ChartNode = {
        id: nodeId,
        kind: 'chart',
        name: chartTitle,
        ui: {
          position: this.calculatePosition(sourceTable.ui.position),
          width: 400,
          height: 300,
        },
        plan: {
          chartType: this.action.chart.chartType === 'histogram' ? 'bar' : this.action.chart.chartType,
          sourceTableId: sourceTableId,
          config: this.action.chart.config,
        } as ChartPlan,
        createdAt: now,
        updatedAt: now,
      }

      // Save snapshot before adding
      store.saveSnapshot(`Create chart "${chartTitle}"`)
      store.addNode(chartNode)
      
      // Add edge from source table to chart
      store.addEdge({
        fromNodeId: sourceTableId,
        toNodeId: nodeId,
        transformType: 'select', // Charts are essentially views
      })

      // Show success toast
      showToast({
        type: 'success',
        message: `Created chart "${chartTitle}"`,
        action: {
          label: 'View',
          onClick: () => {
            store.selectNode(nodeId)
          },
        },
      })

      return {
        success: true,
        message: `Created chart "${chartTitle}"`,
        createdNodeId: nodeId,
        createdNodeName: chartTitle,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      showToast({
        type: 'error',
        message: `Failed to create chart: ${errorMessage}`,
      })
      return {
        success: false,
        message: 'Failed to create chart',
        error: errorMessage,
      }
    }
  }

  getDescription(): string {
    return `Create chart: "${this.suggestion.title}"`
  }

  private calculatePosition(sourcePosition: Position): Position {
    return {
      x: sourcePosition.x + 350,
      y: sourcePosition.y + 50,
    }
  }
}

// ============================================================================
// Apply Patch Command (for cleaning operations)
// ============================================================================

/**
 * Generate a DuckDB SQL expression for the cleaning operation
 */
function generateCleaningExpression(columnId: string, operation: CleaningOperation, tableId: string): string {
  switch (operation.type) {
    case 'trim':
      return `TRIM("${columnId}")`
    
    case 'lowercase':
      return `LOWER("${columnId}")`
    
    case 'uppercase':
      return `UPPER("${columnId}")`
    
    case 'titlecase':
      return `INITCAP("${columnId}")`
    
    case 'replace_typos':
    case 'normalize_case': {
      if (Object.keys(operation.mappings).length === 0) {
        return `"${columnId}"`
      }
      const cases = Object.entries(operation.mappings)
        .map(([from, to]) => `WHEN "${columnId}" = '${from.replace(/'/g, "''")}' THEN '${to.replace(/'/g, "''")}'`)
        .join(' ')
      return `CASE ${cases} ELSE "${columnId}" END`
    }
    
    case 'nullify_placeholders': {
      // Convert all known placeholder values to NULL using shared PLACEHOLDER_VALUES
      const list = PLACEHOLDER_VALUES.map(p => `'${p}'`).join(', ')
      return `CASE WHEN LOWER(TRIM(CAST("${columnId}" AS VARCHAR))) IN (${list}) THEN NULL ELSE "${columnId}" END`
    }
    
    case 'standardize_date':
      // Try to parse the date and format it
      return `STRFTIME(TRY_CAST("${columnId}" AS DATE), '${operation.outputFormat}')`
    
    case 'epoch_to_date':
      if (operation.unit === 'milliseconds') {
        return `EPOCH_MS("${columnId}")`
      } else {
        return `TO_TIMESTAMP("${columnId}")`
      }
    
    case 'fill_missing_numeric':
      // Use subquery to get the fill value
      switch (operation.strategy) {
        case 'mean':
          return `COALESCE("${columnId}", (SELECT AVG("${columnId}") FROM "${tableId}"))`
        case 'median':
          return `COALESCE("${columnId}", (SELECT MEDIAN("${columnId}") FROM "${tableId}"))`
        case 'zero':
          return `COALESCE("${columnId}", 0)`
        default:
          return `COALESCE("${columnId}", 0)`
      }
    
    case 'fill_missing_string':
      return `COALESCE("${columnId}", '${operation.value.replace(/'/g, "''")}')`
    
    case 'remove_outliers':
      // Set outliers to NULL
      return `CASE WHEN "${columnId}" < ${operation.lowerBound} OR "${columnId}" > ${operation.upperBound} THEN NULL ELSE "${columnId}" END`
    
    default:
      return `"${columnId}"`
  }
}

/**
 * Get a descriptive suffix for the cleaned table name
 */
function getCleaningTableSuffix(operation: CleaningOperation): string {
  switch (operation.type) {
    case 'trim': return 'trimmed'
    case 'lowercase': return 'lowercase'
    case 'uppercase': return 'uppercase'
    case 'titlecase': return 'titlecase'
    case 'replace_typos': return 'typos fixed'
    case 'normalize_case': return 'case normalized'
    case 'standardize_date': return 'dates standardized'
    case 'epoch_to_date': return 'dates converted'
    case 'fill_missing_numeric': return 'filled'
    case 'fill_missing_string': return 'filled'
    case 'remove_outliers': return 'outliers removed'
    case 'nullify_placeholders': return 'nullified'
    default: return 'cleaned'
  }
}

export class ApplyPatchCommand implements SuggestionCommand {
  private suggestion: Suggestion
  private action: Extract<SuggestionAction, { kind: 'applyPatch' }>

  constructor(
    suggestion: Suggestion,
    action: Extract<SuggestionAction, { kind: 'applyPatch' }>
  ) {
    this.suggestion = suggestion
    this.action = action
  }

  async execute(): Promise<CommandResult> {
    const store = useProjectStore.getState()
    const tableId = this.suggestion.context.tableId
    const columnId = this.suggestion.context.columnId
    const cleaningOperation = this.suggestion.context.cleaningOperation
    const sourceTable = store.getTableNode(tableId)
    
    if (!sourceTable) {
      return {
        success: false,
        message: 'Table not found',
        error: 'Table not found',
      }
    }

    if (this.action.target === 'cleanCopy' || this.action.target === 'source') {
      try {
        let transformDef: TransformDef
        let tableName: string

        // If we have a cleaning operation, create a calculated column transform
        if (cleaningOperation && columnId) {
          const expression = generateCleaningExpression(columnId, cleaningOperation, tableId)
          const suffix = getCleaningTableSuffix(cleaningOperation)
          
          // Find the column name for better naming
          const column = sourceTable.schema?.columns.find(c => c.id === columnId)
          const columnName = column?.name || columnId
          
          tableName = `${sourceTable.name} (${columnName} ${suffix})`
          
          transformDef = {
            type: 'calculated_column',
            sourceTableId: tableId,
            newColumnName: `${columnName}_cleaned`,
            expression,
          }
        } else {
          // Fallback: just create a copy (legacy behavior)
          tableName = `${sourceTable.name} (cleaned)`
          transformDef = {
            type: 'select',
            sourceTableId: tableId,
            columns: sourceTable.schema?.columns.map(c => ({
              sourceColumnId: c.id,
              include: true,
            })) ?? [],
          }
        }

        // Save snapshot for undo
        store.saveSnapshot(`Clean: ${this.suggestion.title}`)

        const nodeId = store.addDerivedTable({
          name: tableName,
          transformDef,
          upstreamNodeIds: [tableId],
        })

        showToast({
          type: 'success',
          message: `Created "${tableName}"`,
          action: {
            label: 'Open',
            onClick: () => {
              store.selectNode(nodeId)
            },
          },
        })

        return {
          success: true,
          message: `Applied cleaning and created "${tableName}"`,
          createdNodeId: nodeId,
          createdNodeName: tableName,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        showToast({
          type: 'error',
          message: `Failed to apply cleaning: ${errorMessage}`,
        })
        return {
          success: false,
          message: 'Failed to apply cleaning',
          error: errorMessage,
        }
      }
    }

    return {
      success: false,
      message: 'Unknown patch target',
      error: 'Unknown patch target',
    }
  }

  getDescription(): string {
    return `Apply cleaning: "${this.suggestion.title}"`
  }
}

// ============================================================================
// Highlight Cells Command
// ============================================================================

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
      // Set the highlights
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

// ============================================================================
// Launch Recipe Command
// ============================================================================

// Callback to open recipe wizard (set by UI)
let recipeWizardCallback: ((suggestion: Suggestion) => void) | null = null

export function setRecipeWizardCallback(callback: (suggestion: Suggestion) => void): void {
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
    // Trigger the recipe wizard via callback
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

// ============================================================================
// Execute Recipe Transform
// ============================================================================

export async function executeRecipeTransform(
  transform: TransformDef,
  tableName: string,
  sourceTableId: string
): Promise<CommandResult> {
  const store = useProjectStore.getState()
  
  try {
    // Save snapshot for undo
    store.saveSnapshot(`Create ${tableName}`)
    
    // Create the derived table
    const nodeId = store.addDerivedTable({
      name: tableName,
      transformDef: transform,
      upstreamNodeIds: [sourceTableId],
    })

    showToast({
      type: 'success',
      message: `Created "${tableName}"`,
      action: {
        label: 'Open',
        onClick: () => {
          store.selectNode(nodeId)
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

// ============================================================================
// Command Factory
// ============================================================================

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

// ============================================================================
// Apply Suggestion Helper
// ============================================================================

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

