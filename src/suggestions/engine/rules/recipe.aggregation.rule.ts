import { createSuggestionId, getVersionHash, registerRule } from '../registry'
import { detectAggregationOpportunities } from '../opportunities'

registerRule({
  id: 'smart_aggregation',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    if (opportunities.length === 0) return false

    const groupCol = opportunities[0].groupColumns[0].column
    return !ctx.existingDerivedTables?.some(
      (table) =>
        table.transformType === 'group_summarize' &&
        table.groupByColumns?.includes(groupCol.id),
    )
  },
  build: (ctx, meta) => {
    const best = detectAggregationOpportunities(meta.schema, meta.profile?.columns)[0]
    const groupCol = best.groupColumns[0].column
    const groupColRef = groupCol.id
    const valueColRef = best.valueColumn.id

    return {
      id: createSuggestionId('smart_aggregation', ctx.tableId, best.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `Summarize ${best.valueColumn.name} by ${groupCol.name}`,
      description: `Calculate totals and averages of ${best.valueColumn.name} grouped by ${groupCol.name}.`,
      confidence: 'high',
      context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
      why: [
        `"${best.valueColumn.name}" is a numeric column suitable for aggregation`,
        `"${groupCol.name}" has ${best.groupColumns[0].profile?.distinctCount ?? 'few'} distinct categories`,
        'Grouping reveals patterns across categories',
      ],
      impact: { kind: 'derivedTable', summary: `Creates summary table with totals by ${groupCol.name}` },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [groupColRef],
          aggregations: [
            { columnId: valueColRef, operation: 'sum', alias: `Total ${best.valueColumn.name}` },
            { columnId: valueColRef, operation: 'avg', alias: `Avg ${best.valueColumn.name}` },
            { columnId: valueColRef, operation: 'count', alias: 'Count' },
          ],
        },
        tableName: `${best.valueColumn.name} by ${groupCol.name}`,
        openAfterApply: true,
      },
    }
  },
  score: (_ctx, meta) => {
    const cardScore = detectAggregationOpportunities(meta.schema, meta.profile?.columns)[0]
      ?.groupColumns[0]?.profile?.distinctCount
    return cardScore && cardScore >= 3 && cardScore <= 20 ? 85 : 70
  },
})
