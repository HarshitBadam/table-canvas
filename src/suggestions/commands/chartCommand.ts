import { useProjectStore } from '@/state/projectStore'
import type {
  Suggestion,
  SuggestionAction,
  ChartConfig,
  ChartPlan,
  ColumnSchema,
  Position,
} from '@/types'
import type { SuggestionCommand, CommandResult, CommandExecutionOptions } from './types'
import { showToast } from './types'

export class CreateChartCommand implements SuggestionCommand {
  private suggestion: Suggestion
  private action: Extract<SuggestionAction, { kind: 'createChart' }>
  private options: CommandExecutionOptions

  constructor(
    suggestion: Suggestion,
    action: Extract<SuggestionAction, { kind: 'createChart' }>,
    options: CommandExecutionOptions = {},
  ) {
    this.suggestion = suggestion
    this.action = action
    this.options = options
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
      const plan: ChartPlan = {
        chartType: this.action.chart.chartType === 'histogram' ? 'bar' : this.action.chart.chartType,
        sourceTableId,
        config: this.buildConfig(sourceTable.schema?.columns ?? []),
      }
      const nodeId = store.addChart({
        name: chartTitle,
        plan,
        position: this.calculatePosition(sourceTable.ui.position),
      })

      showToast({
        type: 'success',
        message: `Created chart "${chartTitle}"`,
        action: {
          label: 'View',
          onClick: () => {
            if (this.options.navigateToNode) {
              this.options.navigateToNode(nodeId, 'chart')
            } else {
              useProjectStore.getState().selectNode(nodeId)
            }
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

  private buildConfig(columns: ColumnSchema[]): ChartConfig {
    const requested = this.action.chart.config
    const resolveColumn = (reference: string | undefined, label: string): string | undefined => {
      if (!reference) return undefined
      const column = columns.find((candidate) =>
        candidate.id === reference || candidate.name === reference
      )
      if (!column) throw new Error(`${label} column "${reference}" not found`)
      return column.id
    }

    const xAxis = resolveColumn(requested.xAxis, 'X-axis')
    if (!xAxis) throw new Error('Chart requires an X-axis column')

    const yAxis = resolveColumn(requested.yAxis, 'Y-axis')
    const groupBy = resolveColumn(requested.groupBy, 'Group-by')
    const aggregation = requested.aggregation ?? (yAxis ? 'sum' : 'count')
    if (!yAxis && aggregation !== 'count' && aggregation !== 'count_distinct') {
      throw new Error(`Chart aggregation "${aggregation}" requires a Y-axis column`)
    }

    return {
      ...requested,
      xAxis,
      yAxis,
      groupBy,
      aggregation,
      series: requested.series?.map((reference) => {
        const resolved = resolveColumn(reference, 'Series')
        if (!resolved) throw new Error('Chart series column is missing')
        return resolved
      }),
    }
  }
}
