import { createSuggestionId, getVersionHash, registerRule } from '../registry'
import { detectComparisonOpportunities } from '../opportunities'

registerRule({
  id: 'smart_comparison',
  category: 'recipe',
  scope: 'table',
  // Disabled until comparison candidates are supported by correlation or
  // semantic evidence. Similar numeric ranges alone produce noisy pairings.
  when: () => false,
  build: (ctx, meta) => {
    const best = detectComparisonOpportunities(meta.schema, meta.profile?.columns)[0]
    const col1Ref = best.column1.name || best.column1.id
    const col2Ref = best.column2.name || best.column2.id
    const isVarianceLike = best.similarity > 0.6

    return isVarianceLike
      ? {
          id: createSuggestionId('smart_comparison', ctx.tableId, best.column1.id, best.column2.id),
          category: 'recipe',
          scope: 'table',
          title: `Compare ${best.column1.name} vs ${best.column2.name}`,
          description: 'These columns have similar value ranges - calculate the difference and variance.',
          confidence: 'high',
          context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
          why: [
            'Both columns have similar value ranges',
            'May represent comparable metrics (actual vs expected, before vs after)',
            'Difference analysis reveals discrepancies',
          ],
          impact: { kind: 'derivedTable', summary: 'Creates table with difference and % variance' },
          action: {
            kind: 'createDerivedTable',
            transform: {
              type: 'calculated_column',
              sourceTableId: ctx.tableId,
              newColumnName: `${best.column1.name} vs ${best.column2.name} Diff`,
              expression: `("${col1Ref}" - "${col2Ref}")`,
            },
            tableName: `${ctx.tableName} (with comparison)`,
            openAfterApply: true,
          },
        }
      : {
          id: createSuggestionId('smart_comparison_ratio', ctx.tableId, best.column1.id, best.column2.id),
          category: 'recipe',
          scope: 'table',
          title: `Calculate ${best.column1.name} / ${best.column2.name} ratio`,
          description: 'Create a ratio to normalize and compare these metrics.',
          confidence: 'medium',
          context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
          why: [
            'Found two numeric columns',
            'Ratios help normalize different scales',
            'Useful for calculating rates and percentages',
          ],
          impact: { kind: 'derivedTable', summary: 'Adds ratio column' },
          action: {
            kind: 'createDerivedTable',
            transform: {
              type: 'calculated_column',
              sourceTableId: ctx.tableId,
              newColumnName: `${best.column1.name} per ${best.column2.name}`,
              expression: `("${col1Ref}" / NULLIF("${col2Ref}", 0))`,
            },
            tableName: `${ctx.tableName} (with ratio)`,
            openAfterApply: true,
          },
        }
  },
  score: (_ctx, meta) =>
    detectComparisonOpportunities(meta.schema, meta.profile?.columns)[0]?.similarity > 0.6 ? 85 : 65,
})
