/**
 * Chart Analysis Rules
 * 
 * Rules for suggesting chart visualizations based on data characteristics.
 */

import type { SuggestionRule, AggregationOpportunity } from '../../engine/types'
import type { ColumnSchema, ColumnProfile } from '@/lib/types'
import { createSuggestionId, getVersionHash, isAnalyzableNumeric, isGroupableCategory } from '../helpers'

/**
 * Detect aggregation opportunities (numeric + category columns).
 */
export function detectAggregationOpportunities(
  schema: { columns: ColumnSchema[] },
  profiles?: ColumnProfile[]
): AggregationOpportunity[] {
  const opportunities: AggregationOpportunity[] = []
  
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id)
    return isAnalyzableNumeric(c, profile)
  })
  
  const categoryCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id)
    return isGroupableCategory(c, profile)
  })
  
  for (const numCol of numericCols) {
    const numProfile = profiles?.find(p => p.columnId === numCol.id)
    if (categoryCols.length > 0) {
      opportunities.push({
        valueColumn: numCol,
        valueProfile: numProfile,
        groupColumns: categoryCols.map(c => ({
          column: c,
          profile: profiles?.find(p => p.columnId === c.id)
        }))
      })
    }
  }
  
  return opportunities
}

/**
 * Rule: Suggest bar chart for category + numeric data.
 */
export const barChartRule: SuggestionRule = {
  id: 'suggest_bar_chart',
  category: 'analysis',
  scope: 'table',
  
  when: (_ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    return opportunities.length > 0
  },
  
  build: (ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    const opp = opportunities[0]
    const groupCol = opp.groupColumns[0]
    
    return {
      id: createSuggestionId('bar_chart', ctx.tableId, groupCol.column.id, opp.valueColumn.id),
      category: 'analysis',
      scope: 'table',
      title: `Bar chart: ${opp.valueColumn.name} by ${groupCol.column.name}`,
      description: `Visualize ${opp.valueColumn.name} across ${groupCol.profile?.distinctCount ?? 'different'} categories.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
        chartSuggestion: {
          type: 'bar',
          xAxis: groupCol.column.id,
          yAxis: opp.valueColumn.id,
        },
      },
      why: [
        'Low-cardinality categorical column available',
        'Numeric column suitable for aggregation',
        'Bar charts excel at comparing categories',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates a bar chart visualization`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'bar',
          sourceTableId: ctx.tableId,
          config: {
            xAxis: groupCol.column.id,
            yAxis: opp.valueColumn.id,
            aggregation: 'sum',
          },
        },
      },
    }
  },
  
  score: (_ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    if (opportunities.length === 0) return 0
    const groupCol = opportunities[0].groupColumns[0]
    // Prefer low cardinality
    const distinctCount = groupCol.profile?.distinctCount ?? 10
    return distinctCount <= 10 ? 85 : 70
  },
}

/**
 * Rule: Suggest pie chart for low-cardinality categories.
 */
export const pieChartRule: SuggestionRule = {
  id: 'suggest_pie_chart',
  category: 'analysis',
  scope: 'table',
  
  when: (_ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    if (opportunities.length === 0) return false
    
    // Pie charts work best with few categories
    const groupCol = opportunities[0].groupColumns[0]
    return (groupCol.profile?.distinctCount ?? 100) <= 8
  },
  
  build: (ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    const opp = opportunities[0]
    const groupCol = opp.groupColumns[0]
    
    return {
      id: createSuggestionId('pie_chart', ctx.tableId, groupCol.column.id, opp.valueColumn.id),
      category: 'analysis',
      scope: 'table',
      title: `Pie chart: ${opp.valueColumn.name} distribution by ${groupCol.column.name}`,
      description: `Show proportional breakdown across ${groupCol.profile?.distinctCount ?? 'categories'} categories.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
        chartSuggestion: {
          type: 'pie',
          category: groupCol.column.id,
          value: opp.valueColumn.id,
        },
      },
      why: [
        'Few categories (ideal for pie charts)',
        'Shows proportional distribution',
        'Easy to understand at a glance',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates a pie chart visualization`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'pie',
          sourceTableId: ctx.tableId,
          config: {
            xAxis: groupCol.column.id,
            yAxis: opp.valueColumn.id,
          },
        },
      },
    }
  },
  
  score: (_ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns)
    if (opportunities.length === 0) return 0
    const groupCol = opportunities[0].groupColumns[0]
    const distinctCount = groupCol.profile?.distinctCount ?? 100
    return distinctCount <= 5 ? 80 : 65
  },
}

/**
 * All chart analysis rules.
 */
export const chartRules: SuggestionRule[] = [
  barChartRule,
  pieChartRule,
]
