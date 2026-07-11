import { beforeEach, describe, expect, it } from 'vitest'
import type { Suggestion } from '@/types'
import { addSource, resetStore } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'
import { useSuggestionsStore } from '../suggestionsStore'
import { applySuggestion } from './index'

function baseSuggestion(
  id: string,
  tableId: string,
  action: Suggestion['action'],
): Suggestion {
  return {
    id,
    category: 'analysis',
    scope: 'table',
    title: `Suggestion ${id}`,
    confidence: 'high',
    context: {
      tableId,
      tableVersionHash: 'version',
    },
    action,
  }
}

beforeEach(() => {
  resetStore()
  useSuggestionsStore.setState({
    suggestionsCache: new Map(),
    dismissed: new Map(),
    consumed: new Set(),
  })
})

describe('applySuggestion', () => {
  it('creates and connects a chart, then consumes the suggestion', async () => {
    const tableId = addSource('Sales')
    const suggestion = baseSuggestion('chart', tableId, {
      kind: 'createChart',
      chart: {
        chartType: 'bar',
        sourceTableId: tableId,
        title: 'Sales by category',
        config: { xAxis: 'col1', yAxis: 'col2', aggregation: 'sum' },
      },
    })

    const result = await applySuggestion(suggestion)

    expect(result.success).toBe(true)
    expect(result.createdNodeId).toBeTruthy()
    expect(useProjectStore.getState().nodes[result.createdNodeId!]).toMatchObject({
      kind: 'chart',
      name: 'Sales by category',
      plan: { sourceTableId: tableId },
    })
    expect(Object.values(useProjectStore.getState().edges)).toContainEqual(
      expect.objectContaining({
        fromNodeId: tableId,
        toNodeId: result.createdNodeId,
        transformType: 'reference',
      }),
    )
    expect(useSuggestionsStore.getState().isConsumed(suggestion.id)).toBe(true)
  })

  it('creates a derived table from the transform sources', async () => {
    const tableId = addSource('Sales')
    const suggestion = baseSuggestion('derived', tableId, {
      kind: 'createDerivedTable',
      tableName: 'Large sales',
      transform: {
        type: 'filter',
        sourceTableId: tableId,
        conditions: [],
        logic: 'and',
      },
    })

    const result = await applySuggestion(suggestion)

    expect(result.success).toBe(true)
    expect(useProjectStore.getState().nodes[result.createdNodeId!]).toMatchObject({
      kind: 'derived_table',
      name: 'Large sales',
      plan: {
        upstreamNodeIds: [tableId],
        transformDef: { type: 'filter', sourceTableId: tableId },
      },
    })
    expect(useSuggestionsStore.getState().isConsumed(suggestion.id)).toBe(true)
  })

  it('requires cleaning suggestions to pass through the review workflow', async () => {
    const tableId = addSource('Sales')
    const suggestion: Suggestion = {
      ...baseSuggestion('cleaning', tableId, {
        kind: 'applyPatch',
        ops: [],
        target: 'source',
      }),
      category: 'cleaning',
      context: {
        tableId,
        columnId: 'col1',
        tableVersionHash: 'version',
        cleaningOperation: { type: 'trim' },
      },
    }
    const nodeCount = Object.keys(useProjectStore.getState().nodes).length

    const result = await applySuggestion(suggestion)

    expect(result).toMatchObject({
      success: false,
      error: 'Cleaning review required',
    })
    expect(Object.keys(useProjectStore.getState().nodes)).toHaveLength(nodeCount)
    expect(useSuggestionsStore.getState().isConsumed(suggestion.id)).toBe(false)
  })
})
