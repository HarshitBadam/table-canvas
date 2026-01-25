/**
 * Aggregation Analysis Rules
 * 
 * Rules for suggesting group-by and summarization transforms.
 */

import type { SuggestionRule } from '../../engine/types'
import { createSuggestionId, getVersionHash, isAnalyzableNumeric, isGroupableCategory, hasSimilarDerivedTable } from '../helpers'

/**
 * Rule: Suggest group-by aggregation.
 */
export const groupByAggregationRule: SuggestionRule = {
  id: 'suggest_group_by',
  category: 'analysis',
  scope: 'table',
  
  when: (ctx, meta) => {
    // Need at least one groupable column and one numeric column
    const hasGroupable = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isGroupableCategory(c, profile)
    })
    
    const hasNumeric = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isAnalyzableNumeric(c, profile)
    })
    
    if (!hasGroupable || !hasNumeric) return false
    
    // Check if similar aggregation already exists
    const groupableCols = meta.schema.columns.filter(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isGroupableCategory(c, profile)
    })
    
    return !hasSimilarDerivedTable(ctx, 'aggregate', groupableCols.map(c => c.id))
  },
  
  build: (ctx, meta) => {
    const groupableCols = meta.schema.columns.filter(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isGroupableCategory(c, profile)
    })
    
    const numericCols = meta.schema.columns.filter(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isAnalyzableNumeric(c, profile)
    })
    
    const groupCol = groupableCols[0]
    const valueCol = numericCols[0]
    // Use column name (what DuckDB expects) for derived tables
    const groupColRef = groupCol.name || groupCol.id
    const valueColRef = valueCol.name || valueCol.id
    
    return {
      id: createSuggestionId('group_by', ctx.tableId, groupCol.id, valueCol.id),
      category: 'analysis',
      scope: 'table',
      title: `Summarize ${valueCol.name} by ${groupCol.name}`,
      description: `Create a summary table with sum, average, and count for each ${groupCol.name}.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
        aggregationSuggestion: {
          groupBy: [groupColRef],
          measures: [
            { columnId: valueColRef, aggregation: 'sum' },
            { columnId: valueColRef, aggregation: 'avg' },
            { columnId: valueColRef, aggregation: 'count' },
          ],
        },
      },
      why: [
        `${groupCol.name} has suitable cardinality for grouping`,
        `${valueCol.name} is numeric and analyzable`,
        'Aggregations reveal patterns in data',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates summary table with ${groupCol.name} groups`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [groupColRef],
          aggregations: [
            { columnId: valueColRef, operation: 'sum', alias: `total_${valueCol.name}` },
            { columnId: valueColRef, operation: 'avg', alias: `avg_${valueCol.name}` },
            { columnId: valueColRef, operation: 'count', alias: 'count' },
          ],
        },
        tableName: `${ctx.tableName} by ${groupCol.name}`,
        openAfterApply: true,
      },
    }
  },
  
  score: (_ctx, meta) => {
    const groupableCols = meta.schema.columns.filter(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id)
      return isGroupableCategory(c, profile)
    })
    
    // Prefer tables with good grouping options
    if (groupableCols.length === 0) return 0
    
    const profile = meta.profile?.columns.find(p => p.columnId === groupableCols[0].id)
    const distinctCount = profile?.distinctCount ?? 100
    
    return distinctCount <= 20 ? 80 : 65
  },
}

/**
 * Rule: Suggest count by category.
 */
export const countByCategoryRule: SuggestionRule = {
  id: 'suggest_count_by',
  category: 'analysis',
  scope: 'column',
  
  when: (_ctx, meta) => {
    if (!meta.column) return false
    return isGroupableCategory(meta.column, meta.columnProfile)
  },
  
  build: (ctx, meta) => {
    // Use column name (what DuckDB expects) for derived tables
    const colRef = meta.column!.name || meta.column!.id;
    return {
      id: createSuggestionId('count_by', ctx.tableId, meta.column!.id),
      category: 'analysis',
      scope: 'column',
      title: `Count by ${meta.column!.name}`,
      description: `Show how many rows exist for each ${meta.column!.name} value.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Categorical column with reasonable cardinality',
        'Count shows distribution of values',
        'Useful for understanding data composition',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates count table by ${meta.column!.name}`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [colRef],
          aggregations: [
            { columnId: colRef, operation: 'count', alias: 'count' },
          ],
        },
        tableName: `Count by ${meta.column!.name}`,
        openAfterApply: true,
      },
    };
  },
  
  score: (_ctx, meta) => {
    const distinctCount = meta.columnProfile?.distinctCount ?? 100
    return distinctCount <= 20 ? 70 : 55
  },
}

/**
 * All aggregation analysis rules.
 */
export const aggregationRules: SuggestionRule[] = [
  groupByAggregationRule,
  countByCategoryRule,
]
