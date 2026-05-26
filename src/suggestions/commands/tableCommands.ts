import { useProjectStore } from '@/state/projectStore'
import type {
  Suggestion,
  SuggestionAction,
  Position,
  TransformDef,
  CleaningOperation,
} from '@/types'
import { PLACEHOLDER_VALUES } from '../cleaningConstants'
import type { SuggestionCommand, CommandResult } from './types'
import { showToast } from './types'

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

    const tableName = this.action.tableName ?? `${sourceTable.name} (transformed)`

    try {
      const nodeId = store.addDerivedTable({
        name: tableName,
        transformDef: this.action.transform,
        upstreamNodeIds: [sourceTableId],
        position: this.calculatePosition(sourceTable.ui.position),
      })

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
      const list = PLACEHOLDER_VALUES.map(p => `'${p}'`).join(', ')
      return `CASE WHEN LOWER(TRIM(CAST("${columnId}" AS VARCHAR))) IN (${list}) THEN NULL ELSE "${columnId}" END`
    }

    case 'standardize_date':
      return `STRFTIME(TRY_CAST("${columnId}" AS DATE), '${operation.outputFormat}')`

    case 'epoch_to_date':
      if (operation.unit === 'milliseconds') {
        return `EPOCH_MS("${columnId}")`
      } else {
        return `TO_TIMESTAMP("${columnId}")`
      }

    case 'fill_missing_numeric':
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
      return `CASE WHEN "${columnId}" < ${operation.lowerBound} OR "${columnId}" > ${operation.upperBound} THEN NULL ELSE "${columnId}" END`

    default:
      return `"${columnId}"`
  }
}

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

        if (cleaningOperation && columnId) {
          const expression = generateCleaningExpression(columnId, cleaningOperation, tableId)
          const suffix = getCleaningTableSuffix(cleaningOperation)

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
