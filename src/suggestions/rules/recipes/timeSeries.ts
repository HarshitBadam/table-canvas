/**
 * Time Series Analysis Recipes
 * 
 * Rules for time-based analysis suggestions.
 */

import type { SuggestionRule, TimeSeriesOpportunity } from '../../engine/types'
import type { ColumnSchema, ColumnProfile } from '@/lib/types'
import { createSuggestionId, getVersionHash, isAnalyzableNumeric } from '../helpers'

/**
 * Detect time series analysis opportunities.
 */
export function detectTimeSeriesOpportunities(
  schema: { columns: ColumnSchema[] },
  profiles?: ColumnProfile[],
  rowCount?: number
): TimeSeriesOpportunity[] {
  const opportunities: TimeSeriesOpportunity[] = []
  
  const dateCols = schema.columns.filter(c => c.type === 'date' || c.type === 'datetime')
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id)
    return isAnalyzableNumeric(c, profile)
  })
  
  for (const dateCol of dateCols) {
    const dateProfile = profiles?.find(p => p.columnId === dateCol.id)
    
    let suggestedPeriod: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'
    
    if (dateProfile?.min && dateProfile?.max && rowCount) {
      const spanDays = (dateProfile.max - dateProfile.min) / (1000 * 60 * 60 * 24)
      const avgGap = spanDays / Math.max(rowCount - 1, 1)
      
      if (avgGap < 2) suggestedPeriod = 'day'
      else if (avgGap < 10) suggestedPeriod = 'week'
      else if (avgGap < 45) suggestedPeriod = 'month'
      else if (avgGap < 120) suggestedPeriod = 'quarter'
      else suggestedPeriod = 'year'
    }
    
    for (const numCol of numericCols) {
      opportunities.push({
        dateColumn: dateCol,
        valueColumn: numCol,
        suggestedPeriod,
      })
    }
  }
  
  return opportunities
}

/**
 * Rule: Time series trend analysis.
 */
export const timeSeriesTrendRule: SuggestionRule = {
  id: 'recipe_time_series_trend',
  category: 'recipe',
  scope: 'table',
  
  when: (ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(
      meta.schema,
      meta.profile?.columns,
      meta.profile?.rowCount
    )
    return opportunities.length > 0
  },
  
  build: (ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(
      meta.schema,
      meta.profile?.columns,
      meta.profile?.rowCount
    )
    const opp = opportunities[0]
    
    return {
      id: createSuggestionId('time_series', ctx.tableId, opp.dateColumn.id, opp.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `Time Series: ${opp.valueColumn.name} over ${opp.dateColumn.name}`,
      description: `Analyze trends in ${opp.valueColumn.name} over time by ${opp.suggestedPeriod}.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
        recipeType: 'time_series',
        config: {
          dateColumn: opp.dateColumn.id,
          valueColumn: opp.valueColumn.id,
          period: opp.suggestedPeriod,
        },
      },
      why: [
        `${opp.dateColumn.name} provides temporal ordering`,
        `${opp.valueColumn.name} is suitable for trend analysis`,
        `Suggested period: ${opp.suggestedPeriod} based on data density`,
      ],
      impact: {
        kind: 'chart',
        summary: `Creates a time series line chart`,
      },
      action: {
        kind: 'createChart',
        chartType: 'line',
        config: {
          xAxis: opp.dateColumn.id,
          yAxis: opp.valueColumn.id,
          period: opp.suggestedPeriod,
        },
      },
    }
  },
  
  score: (_ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(
      meta.schema,
      meta.profile?.columns,
      meta.profile?.rowCount
    )
    
    if (opportunities.length === 0) return 0
    return 80
  },
}

/**
 * Rule: Period-over-period comparison.
 */
export const periodComparisonRule: SuggestionRule = {
  id: 'recipe_period_comparison',
  category: 'recipe',
  scope: 'table',
  
  when: (ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(
      meta.schema,
      meta.profile?.columns,
      meta.profile?.rowCount
    )
    
    // Need sufficient data for period comparison
    const rowCount = meta.profile?.rowCount ?? 0
    return opportunities.length > 0 && rowCount >= 20
  },
  
  build: (ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(
      meta.schema,
      meta.profile?.columns,
      meta.profile?.rowCount
    )
    const opp = opportunities[0]
    
    return {
      id: createSuggestionId('period_comparison', ctx.tableId, opp.dateColumn.id, opp.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `Period Comparison: ${opp.valueColumn.name}`,
      description: `Compare ${opp.valueColumn.name} across ${opp.suggestedPeriod}s.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
        recipeType: 'period_comparison',
        config: {
          dateColumn: opp.dateColumn.id,
          valueColumn: opp.valueColumn.id,
          period: opp.suggestedPeriod,
        },
      },
      why: [
        'Sufficient data for meaningful comparison',
        'Period-over-period analysis shows growth/decline',
        'Helps identify seasonal patterns',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates period-over-period comparison table`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'aggregate',
          sourceTableId: ctx.tableId,
          groupBy: [opp.dateColumn.id],
          aggregations: [
            { columnId: opp.valueColumn.id, function: 'SUM', alias: 'total' },
            { columnId: opp.valueColumn.id, function: 'AVG', alias: 'average' },
            { columnId: '*', function: 'COUNT', alias: 'count' },
          ],
          periodTruncate: opp.suggestedPeriod,
        },
        tableName: `${opp.valueColumn.name} by ${opp.suggestedPeriod}`,
        openAfterApply: true,
      },
    }
  },
  
  score: (_ctx, meta) => {
    const rowCount = meta.profile?.rowCount ?? 0
    return rowCount >= 100 ? 70 : 55
  },
}

/**
 * All time series rules.
 */
export const timeSeriesRules: SuggestionRule[] = [
  timeSeriesTrendRule,
  periodComparisonRule,
]
