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
    return {
      id: createSuggestionId('smart_time_series', ctx.tableId, best.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `${best.valueColumn.name} trend over time`,
      description: `Create a summary of ${best.valueColumn.name} for each ${best.dateColumn.name} value.`,
      confidence: 'high',
      context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
      why: [
        `"${best.dateColumn.name}" contains date/time data`,
        `"${best.valueColumn.name}" is a numeric metric`,
        'A date summary provides totals, averages, and record counts',
      ],
      impact: { kind: 'recipe', summary: 'Creates a summary table grouped by date' },
      action: {
        kind: 'launchRecipe',
        recipeId: 'trend_summary',
        initialBindings: {
          dateColumnId: best.dateColumn.id,
          valueColumnId: best.valueColumn.id,
        },
      },
    }
  },
  score: () => 80,
})
