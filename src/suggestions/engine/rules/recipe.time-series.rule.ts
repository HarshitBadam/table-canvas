import { createSuggestionId, getVersionHash, registerRule } from '../registry'
import { detectTimeSeriesOpportunities } from '../opportunities'

registerRule({
  id: 'smart_time_series',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) =>
    detectTimeSeriesOpportunities(meta.schema, meta.profile?.columns, meta.profile?.rowCount).length > 0,
  build: (ctx, meta) => {
    const best = detectTimeSeriesOpportunities(
      meta.schema,
      meta.profile?.columns,
      meta.profile?.rowCount,
    )[0]
    const periodLabel = best.suggestedPeriod.charAt(0).toUpperCase() + best.suggestedPeriod.slice(1)

    return {
      id: createSuggestionId('smart_time_series', ctx.tableId, best.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `${best.valueColumn.name} trend over time`,
      description: `Analyze how ${best.valueColumn.name} changes over ${best.dateColumn.name}. Suggested grouping: ${periodLabel}ly.`,
      confidence: 'high',
      context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
      why: [
        `"${best.dateColumn.name}" contains date/time data`,
        `"${best.valueColumn.name}" is a numeric metric`,
        `Data appears to be ${best.suggestedPeriod}ly - grouping by ${best.suggestedPeriod} recommended`,
      ],
      impact: { kind: 'recipe', summary: `Creates trend summary grouped by ${best.suggestedPeriod}` },
      action: {
        kind: 'launchRecipe',
        recipeId: 'trend_summary',
        initialBindings: {
          dateColumnId: best.dateColumn.id,
          valueColumnId: best.valueColumn.id,
          period: best.suggestedPeriod,
        },
      },
    }
  },
  score: () => 80,
})
