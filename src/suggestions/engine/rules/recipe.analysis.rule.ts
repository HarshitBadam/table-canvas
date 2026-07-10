import { isAnalyzableNumeric } from '../classification'
import { createSuggestionId, getVersionHash, registerRule } from '../registry'
import type { ColumnSchema } from '@/types'

const actualColumn = (columns: ColumnSchema[]) =>
  columns.find((column) => /actual|real/.test(column.name.toLowerCase()))

const budgetColumn = (columns: ColumnSchema[]) =>
  columns.find((column) => /budget|plan|target|forecast/.test(column.name.toLowerCase()))

registerRule({
  id: 'variance_analysis',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) => Boolean(actualColumn(meta.schema.columns) && budgetColumn(meta.schema.columns)),
  build: (ctx, meta) => {
    const actualCol = actualColumn(meta.schema.columns)!
    const budgetCol = budgetColumn(meta.schema.columns)!
    return {
      id: createSuggestionId('variance_analysis', ctx.tableId, actualCol.id, budgetCol.id),
      category: 'recipe',
      scope: 'table',
      title: 'Variance Analysis',
      description: `Compare ${actualCol.name} vs ${budgetCol.name} with variance calculations.`,
      confidence: 'high',
      context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
      why: [
        'Detected actual/budget column pattern',
        'Common in financial analysis',
        'Track performance vs targets',
      ],
      impact: { kind: 'recipe', summary: 'Creates variance table with absolute and % variance' },
      action: {
        kind: 'launchRecipe',
        recipeId: 'variance_analysis',
        initialBindings: { actualColumnId: actualCol.id, budgetColumnId: budgetCol.id },
      },
    }
  },
  score: () => 90,
})

registerRule({
  id: 'period_over_period',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) =>
    meta.schema.columns.some((column) => column.type === 'date' || column.type === 'datetime') &&
    meta.schema.columns.some((column) =>
      isAnalyzableNumeric(
        column,
        meta.profile?.columns.find((profile) => profile.columnId === column.id),
      ),
    ),
  build: (ctx, meta) => {
    const dateCol = meta.schema.columns.find(
      (column) => column.type === 'date' || column.type === 'datetime',
    )!
    const numericCol = meta.schema.columns.find((column) =>
      isAnalyzableNumeric(
        column,
        meta.profile?.columns.find((profile) => profile.columnId === column.id),
      ),
    )!
    return {
      id: createSuggestionId('period_over_period', ctx.tableId, numericCol.id),
      category: 'recipe',
      scope: 'table',
      title: 'Period-over-Period Analysis',
      description: `Calculate changes between time periods for ${numericCol.name}.`,
      confidence: 'medium',
      context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
      why: ['Table has time and value data', 'Compare performance across periods', 'Calculate growth rates'],
      impact: { kind: 'recipe', summary: 'Creates table with period comparisons' },
      action: {
        kind: 'launchRecipe',
        recipeId: 'period_over_period',
        initialBindings: { dateColumnId: dateCol.id, valueColumnId: numericCol.id },
      },
    }
  },
  score: () => 60,
})

registerRule({
  id: 'ratio_kpi',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const numericCols = meta.schema.columns.filter((column) => column.type === 'number')
    if (
      numericCols.length < 2 ||
      ctx.existingDerivedTables?.some((table) => table.transformType === 'calculated_column')
    ) {
      return false
    }
    const [name1, name2] = numericCols.slice(0, 2).map((column) => column.name.toLowerCase())
    return (
      (name1.includes('gross') && name2.includes('revenue')) ||
      (name1.includes('profit') && name2.includes('revenue')) ||
      (name1.includes('cost') && name2.includes('revenue')) ||
      (name1.includes('net') && name2.includes('gross')) ||
      name1.includes('margin') ||
      name2.includes('margin')
    )
  },
  build: (ctx, meta) => {
    const [num1, num2] = meta.schema.columns.filter((column) => column.type === 'number')
    const num1Ref = num1.name || num1.id
    const num2Ref = num2.name || num2.id
    return {
      id: createSuggestionId('ratio_kpi', ctx.tableId, num1.id, num2.id),
      category: 'recipe',
      scope: 'table',
      title: `Calculate ${num1.name} / ${num2.name} Ratio`,
      description: 'Create a ratio KPI from these related metrics.',
      confidence: 'medium',
      context: { tableId: ctx.tableId, tableVersionHash: getVersionHash(ctx) },
      why: ['Detected related numeric columns', 'Ratios normalize for comparison', 'Common business KPI pattern'],
      impact: { kind: 'derivedTable', summary: 'Adds calculated ratio column' },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'calculated_column',
          sourceTableId: ctx.tableId,
          newColumnName: `${num1.name}_ratio`,
          expression: `("${num1Ref}" / NULLIF("${num2Ref}", 0)) * 100`,
        },
        tableName: `${ctx.tableName} (with ratios)`,
        openAfterApply: true,
      },
    }
  },
  score: () => 65,
})
