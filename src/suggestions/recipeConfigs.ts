import type { ColumnSchema, TransformDef } from '@/types'

export interface RecipeConfig {
  id: string
  title: string
  description: string
  fields: RecipeField[]
  outputs: string[]
  buildTransform: (bindings: Record<string, string>, tableId: string, columns?: ColumnSchema[]) => TransformDef
  getTableName: (tableName: string, bindings: Record<string, string>, columns?: ColumnSchema[]) => string
}

export interface RecipeField {
  id: string
  label: string
  type: 'column' | 'select'
  columnType?: 'string' | 'number' | 'date' | 'datetime'
  required: boolean
  hint?: string
  options?: { value: string; label: string }[]
  /**
   * For 'column' fields whose options should come from the table selected in another
   * (table-picker) field rather than the current table — e.g. reconciliation keys.
   */
  sourceTableField?: string
}

export const RECIPE_CONFIGS: Record<string, RecipeConfig> = {
  trend_summary: {
    id: 'trend_summary',
    title: 'Trend Analysis',
    description: 'Analyze how values change over time with aggregated summaries.',
    fields: [
      { id: 'dateColumnId', label: 'Date Column', type: 'column', columnType: 'date', required: true, hint: 'The time dimension for grouping' },
      { id: 'valueColumnId', label: 'Value Column', type: 'column', columnType: 'number', required: true, hint: 'The metric to analyze' },
      { id: 'period', label: 'Group By', type: 'select', required: true, options: [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'quarter', label: 'Quarter' },
        { value: 'year', label: 'Year' },
      ]},
    ],
    outputs: ['Summary table with period totals', 'Line chart showing trend'],
    buildTransform: (bindings, tableId, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      const dateColRef = bindings.dateColumnId
      const valueColRef = bindings.valueColumnId
      return {
        type: 'group_summarize',
        sourceTableId: tableId,
        groupByColumns: [dateColRef],
        aggregations: [
          { columnId: valueColRef, operation: 'sum', alias: `Total ${valueName}` },
          { columnId: valueColRef, operation: 'avg', alias: `Avg ${valueName}` },
          { columnId: valueColRef, operation: 'count', alias: 'Record Count' },
        ],
      }
    },
    getTableName: (_tableName, bindings, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Values'
      return `${valueName} Trend`
    },
  },
  contribution: {
    id: 'contribution',
    title: 'Category Contribution',
    description: 'Analyze how each category contributes to the total (Pareto analysis).',
    fields: [
      { id: 'categoryColumnId', label: 'Category Column', type: 'column', columnType: 'string', required: true, hint: 'The dimension to group by' },
      { id: 'valueColumnId', label: 'Value Column', type: 'column', columnType: 'number', required: true, hint: 'The metric to sum' },
    ],
    outputs: ['Summary table ranked by contribution', 'Bar chart showing breakdown', 'Cumulative percentage'],
    buildTransform: (bindings, tableId, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      const categoryColRef = bindings.categoryColumnId
      const valueColRef = bindings.valueColumnId
      return {
        type: 'group_summarize',
        sourceTableId: tableId,
        groupByColumns: [categoryColRef],
        aggregations: [
          { columnId: valueColRef, operation: 'sum', alias: `Total ${valueName}` },
          { columnId: valueColRef, operation: 'count', alias: 'Record Count' },
        ],
      }
    },
    getTableName: (_tableName, bindings, columns) => {
      const categoryCol = columns?.find(c => c.id === bindings.categoryColumnId)
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const categoryName = categoryCol?.name || 'Category'
      const valueName = valueCol?.name || 'Value'
      return `${valueName} by ${categoryName}`
    },
  },
  variance_analysis: {
    id: 'variance_analysis',
    title: 'Variance Analysis',
    description: 'Compare actual vs planned/budgeted values with variance calculations.',
    fields: [
      { id: 'actualColumnId', label: 'Actual Column', type: 'column', columnType: 'number', required: true, hint: 'The actual/real values' },
      { id: 'budgetColumnId', label: 'Budget/Plan Column', type: 'column', columnType: 'number', required: true, hint: 'The target/expected values' },
      { id: 'groupByColumnId', label: 'Group By (optional)', type: 'column', columnType: 'string', required: false, hint: 'Optional dimension for grouping' },
    ],
    outputs: ['Variance table (absolute & percentage)', 'Variance chart'],
    buildTransform: (bindings, tableId, columns) => {
      const actualCol = columns?.find(c => c.id === bindings.actualColumnId)
      const budgetCol = columns?.find(c => c.id === bindings.budgetColumnId)
      const actualName = actualCol?.name || 'Actual'
      const budgetName = budgetCol?.name || 'Budget'
      const actualColRef = bindings.actualColumnId
      const budgetColRef = bindings.budgetColumnId
      return {
        type: 'calculated_column',
        sourceTableId: tableId,
        newColumnName: `${actualName} vs ${budgetName} Variance`,
        expression: `("${actualColRef}" - "${budgetColRef}")`,
      }
    },
    getTableName: (_tableName, bindings, columns) => {
      const actualCol = columns?.find(c => c.id === bindings.actualColumnId)
      const budgetCol = columns?.find(c => c.id === bindings.budgetColumnId)
      const actualName = actualCol?.name || 'Actual'
      const budgetName = budgetCol?.name || 'Budget'
      return `${actualName} vs ${budgetName} Variance`
    },
  },
  reconciliation: {
    id: 'reconciliation',
    title: 'Reconciliation',
    description: 'Match records between two datasets and identify discrepancies.',
    fields: [
      { id: 'leftTableId', label: 'Left Table', type: 'select', required: true },
      { id: 'rightTableId', label: 'Right Table', type: 'select', required: true },
      { id: 'leftKeyColumn', label: 'Left Key Column', type: 'column', required: true, hint: 'The matching key from left table', sourceTableField: 'leftTableId' },
      { id: 'rightKeyColumn', label: 'Right Key Column', type: 'column', required: true, hint: 'The matching key from right table', sourceTableField: 'rightTableId' },
    ],
    outputs: ['Matched records', 'Unmatched from left', 'Unmatched from right'],
    buildTransform: (bindings) => ({
      type: 'join',
      leftTableId: bindings.leftTableId,
      rightTableId: bindings.rightTableId,
      joinType: 'full',
      leftKey: bindings.leftKeyColumn,
      rightKey: bindings.rightKeyColumn,
    }),
    getTableName: () => 'Reconciliation Results',
  },
  period_over_period: {
    id: 'period_over_period',
    title: 'Period-over-Period Analysis',
    description: 'Calculate changes between time periods to track growth and trends.',
    fields: [
      { id: 'dateColumnId', label: 'Date Column', type: 'column', columnType: 'date', required: true, hint: 'The time dimension for comparison' },
      { id: 'valueColumnId', label: 'Value Column', type: 'column', columnType: 'number', required: true, hint: 'The metric to compare across periods' },
      { id: 'period', label: 'Period', type: 'select', required: true, options: [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'quarter', label: 'Quarter' },
        { value: 'year', label: 'Year' },
      ]},
    ],
    outputs: ['Table with period comparisons', 'Growth rate calculations'],
    buildTransform: (bindings, tableId, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      const dateColRef = bindings.dateColumnId
      const valueColRef = bindings.valueColumnId
      return {
        type: 'group_summarize',
        sourceTableId: tableId,
        groupByColumns: [dateColRef],
        aggregations: [
          { columnId: valueColRef, operation: 'sum', alias: `Total ${valueName}` },
          { columnId: valueColRef, operation: 'avg', alias: `Avg ${valueName}` },
          { columnId: valueColRef, operation: 'count', alias: 'Record Count' },
        ],
      }
    },
    getTableName: (_tableName, bindings, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      const period = bindings.period || 'period'
      return `${valueName} by ${period.charAt(0).toUpperCase() + period.slice(1)}`
    },
  },
}
