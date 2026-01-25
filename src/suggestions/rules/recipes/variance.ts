/**
 * Variance Analysis Recipes
 * 
 * Rules for variance analysis and comparison insights.
 */

import type { SuggestionRule, VarianceOpportunity } from '../../engine/types'
import type { ColumnSchema, ColumnProfile } from '@/lib/types'
import { createSuggestionId, getVersionHash, isAnalyzableNumeric, isGroupableCategory } from '../helpers'

/**
 * Detect variance analysis opportunities.
 */
export function detectVarianceOpportunities(
  schema: { columns: ColumnSchema[] },
  profiles?: ColumnProfile[]
): VarianceOpportunity[] {
  const opportunities: VarianceOpportunity[] = []
  
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
    
    for (const catCol of categoryCols) {
      const catProfile = profiles?.find(p => p.columnId === catCol.id)
      
      // Estimate expected variance based on data characteristics
      let expectedVariance: 'high' | 'medium' | 'low' = 'medium'
      
      if (numProfile?.stdDev !== undefined && numProfile?.mean !== undefined) {
        const cv = numProfile.stdDev / Math.abs(numProfile.mean || 1) // Coefficient of variation
        if (cv > 0.5) expectedVariance = 'high'
        else if (cv < 0.2) expectedVariance = 'low'
      }
      
      // Only suggest if reasonable number of categories
      if ((catProfile?.distinctCount ?? 100) <= 50) {
        opportunities.push({
          valueColumn: numCol,
          groupColumn: catCol,
          expectedVariance,
        })
      }
    }
  }
  
  return opportunities
}

/**
 * Rule: Variance analysis recipe.
 */
export const varianceAnalysisRule: SuggestionRule = {
  id: 'recipe_variance_analysis',
  category: 'recipe',
  scope: 'table',
  
  when: (_ctx, meta) => {
    const opportunities = detectVarianceOpportunities(meta.schema, meta.profile?.columns)
    return opportunities.length > 0
  },
  
  build: (ctx, meta) => {
    const opportunities = detectVarianceOpportunities(meta.schema, meta.profile?.columns)
    const opp = opportunities[0]
    // Use column ID (what DuckDB uses internally) for derived tables
    const groupColRef = opp.groupColumn.id
    const valueColRef = opp.valueColumn.id
    
    return {
      id: createSuggestionId('variance_analysis', ctx.tableId, opp.groupColumn.id, opp.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `Variance Analysis: ${opp.valueColumn.name} by ${opp.groupColumn.name}`,
      description: `Analyze how ${opp.valueColumn.name} varies across ${opp.groupColumn.name} groups.`,
      confidence: opp.expectedVariance === 'high' ? 'high' : 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
        recipeType: 'variance_analysis',
        config: {
          valueColumn: valueColRef,
          groupColumn: groupColRef,
          expectedVariance: opp.expectedVariance,
        },
      },
      why: [
        `${opp.valueColumn.name} shows ${opp.expectedVariance} variance`,
        `${opp.groupColumn.name} provides meaningful grouping`,
        'Variance analysis reveals group-level differences',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates variance analysis with statistics per group`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [groupColRef],
          aggregations: [
            { columnId: valueColRef, operation: 'avg', alias: 'mean' },
            { columnId: valueColRef, operation: 'min', alias: 'min' },
            { columnId: valueColRef, operation: 'max', alias: 'max' },
            { columnId: valueColRef, operation: 'count', alias: 'count' },
          ],
        },
        tableName: `${opp.valueColumn.name} Variance by ${opp.groupColumn.name}`,
        openAfterApply: true,
      },
    }
  },
  
  score: (_ctx, meta) => {
    const opportunities = detectVarianceOpportunities(meta.schema, meta.profile?.columns)
    if (opportunities.length === 0) return 0
    
    const opp = opportunities[0]
    return opp.expectedVariance === 'high' ? 75 : 60
  },
}

/**
 * All variance analysis rules.
 */
export const varianceRules: SuggestionRule[] = [
  varianceAnalysisRule,
]
