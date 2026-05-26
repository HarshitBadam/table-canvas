import { useProjectStore } from '@/state/projectStore'
import type {
  Suggestion,
  SuggestionAction,
  ChartNode,
  ChartPlan,
  Position,
} from '@/types'
import { generateId } from '@/lib/utils'
import type { SuggestionCommand, CommandResult } from './types'
import { showToast } from './types'

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

      store.saveSnapshot(`Create chart "${chartTitle}"`)
      store.addNode(chartNode)

      store.addEdge({
        fromNodeId: sourceTableId,
        toNodeId: nodeId,
        transformType: 'select',
      })

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
