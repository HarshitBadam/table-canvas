/**
 * Recipe Rules
 * 
 * Suggestion rules for data recipes and advanced transformations.
 */

import { registerRule, createSuggestionId, getVersionHash } from '../registry';
import { isAnalyzableNumeric } from '../classification';
import { 
  detectAggregationOpportunities, 
  detectTimeSeriesOpportunities,
  detectComparisonOpportunities,
} from '../opportunities';

// ============================================================================
// Smart Aggregation Analysis Rule
// ============================================================================

registerRule({
  id: 'smart_aggregation',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns);
    if (opportunities.length === 0) return false;
    
    // Check if a similar derived table already exists
    const best = opportunities[0];
    const groupCol = best.groupColumns[0].column;
    
    if (ctx.existingDerivedTables?.some(dt => 
      dt.transformType === 'group_summarize' && 
      dt.groupByColumns?.includes(groupCol.id)
    )) {
      return false;
    }
    
    return true;
  },
  build: (ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns);
    const best = opportunities[0];
    const groupCol = best.groupColumns[0].column;
    // Use column name (what DuckDB expects) for derived tables
    const groupColRef = groupCol.name || groupCol.id;
    const valueColRef = best.valueColumn.name || best.valueColumn.id;
    
    return {
      id: createSuggestionId('smart_aggregation', ctx.tableId, best.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `Summarize ${best.valueColumn.name} by ${groupCol.name}`,
      description: `Calculate totals and averages of ${best.valueColumn.name} grouped by ${groupCol.name}.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `"${best.valueColumn.name}" is a numeric column suitable for aggregation`,
        `"${groupCol.name}" has ${best.groupColumns[0].profile?.distinctCount ?? 'few'} distinct categories`,
        'Grouping reveals patterns across categories',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates summary table with totals by ${groupCol.name}`,
      },
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
    };
  },
  score: (_ctx, meta) => {
    const opportunities = detectAggregationOpportunities(meta.schema, meta.profile?.columns);
    const cardScore = opportunities[0]?.groupColumns[0]?.profile?.distinctCount;
    if (cardScore && cardScore >= 3 && cardScore <= 20) return 85;
    return 70;
  },
});

// ============================================================================
// Smart Time Series Analysis Rule
// ============================================================================

registerRule({
  id: 'smart_time_series',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(meta.schema, meta.profile?.columns, meta.profile?.rowCount);
    return opportunities.length > 0;
  },
  build: (ctx, meta) => {
    const opportunities = detectTimeSeriesOpportunities(meta.schema, meta.profile?.columns, meta.profile?.rowCount);
    const best = opportunities[0];
    const periodLabel = best.suggestedPeriod.charAt(0).toUpperCase() + best.suggestedPeriod.slice(1);
    
    return {
      id: createSuggestionId('smart_time_series', ctx.tableId, best.valueColumn.id),
      category: 'recipe',
      scope: 'table',
      title: `${best.valueColumn.name} trend over time`,
      description: `Analyze how ${best.valueColumn.name} changes over ${best.dateColumn.name}. Suggested grouping: ${periodLabel}ly.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `"${best.dateColumn.name}" contains date/time data`,
        `"${best.valueColumn.name}" is a numeric metric`,
        `Data appears to be ${best.suggestedPeriod}ly - grouping by ${best.suggestedPeriod} recommended`,
      ],
      impact: {
        kind: 'recipe',
        summary: `Creates trend summary grouped by ${best.suggestedPeriod}`,
      },
      action: {
        kind: 'launchRecipe',
        recipeId: 'trend_summary',
        initialBindings: {
          dateColumnId: best.dateColumn.id,
          valueColumnId: best.valueColumn.id,
          period: best.suggestedPeriod,
        },
      },
    };
  },
  score: (_ctx, _meta) => 80,
});

// ============================================================================
// Smart Comparison Analysis Rule
// ============================================================================

registerRule({
  id: 'smart_comparison',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const opportunities = detectComparisonOpportunities(meta.schema, meta.profile?.columns);
    if (opportunities.length === 0 || opportunities[0].similarity <= 0.3) return false;
    
    if (ctx.existingDerivedTables?.some(dt => dt.transformType === 'calculated_column')) {
      return false;
    }
    
    return true;
  },
  build: (ctx, meta) => {
    const opportunities = detectComparisonOpportunities(meta.schema, meta.profile?.columns);
    const best = opportunities[0];
    // Use column name (what DuckDB expects) for derived tables
    const col1Ref = best.column1.name || best.column1.id;
    const col2Ref = best.column2.name || best.column2.id;
    
    const isVarianceLike = best.similarity > 0.6;
    
    if (isVarianceLike) {
      return {
        id: createSuggestionId('smart_comparison', ctx.tableId, best.column1.id, best.column2.id),
        category: 'recipe',
        scope: 'table',
        title: `Compare ${best.column1.name} vs ${best.column2.name}`,
        description: `These columns have similar value ranges - calculate the difference and variance.`,
        confidence: 'high',
        context: {
          tableId: ctx.tableId,
          tableVersionHash: getVersionHash(ctx),
        },
        why: [
          'Both columns have similar value ranges',
          'May represent comparable metrics (actual vs expected, before vs after)',
          'Difference analysis reveals discrepancies',
        ],
        impact: {
          kind: 'derivedTable',
          summary: `Creates table with difference and % variance`,
        },
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
      };
    } else {
      return {
        id: createSuggestionId('smart_comparison_ratio', ctx.tableId, best.column1.id, best.column2.id),
        category: 'recipe',
        scope: 'table',
        title: `Calculate ${best.column1.name} / ${best.column2.name} ratio`,
        description: `Create a ratio to normalize and compare these metrics.`,
        confidence: 'medium',
        context: {
          tableId: ctx.tableId,
          tableVersionHash: getVersionHash(ctx),
        },
        why: [
          'Found two numeric columns',
          'Ratios help normalize different scales',
          'Useful for calculating rates and percentages',
        ],
        impact: {
          kind: 'derivedTable',
          summary: `Adds ratio column`,
        },
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
      };
    }
  },
  score: (_ctx, meta) => {
    const opportunities = detectComparisonOpportunities(meta.schema, meta.profile?.columns);
    if (opportunities.length > 0 && opportunities[0].similarity > 0.6) return 85;
    return 65;
  },
});

// ============================================================================
// Variance Analysis Rule
// ============================================================================

registerRule({
  id: 'variance_analysis',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) => {
    const actualCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('actual') || 
      c.name.toLowerCase().includes('real')
    );
    const budgetCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('budget') || 
      c.name.toLowerCase().includes('plan') ||
      c.name.toLowerCase().includes('target') ||
      c.name.toLowerCase().includes('forecast')
    );
    return actualCol !== undefined && budgetCol !== undefined;
  },
  build: (ctx, meta) => {
    const actualCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('actual') || 
      c.name.toLowerCase().includes('real')
    )!;
    const budgetCol = meta.schema.columns.find(c => 
      c.name.toLowerCase().includes('budget') || 
      c.name.toLowerCase().includes('plan') ||
      c.name.toLowerCase().includes('target') ||
      c.name.toLowerCase().includes('forecast')
    )!;
    
    return {
      id: createSuggestionId('variance_analysis', ctx.tableId, actualCol.id, budgetCol.id),
      category: 'recipe',
      scope: 'table',
      title: 'Variance Analysis',
      description: `Compare ${actualCol.name} vs ${budgetCol.name} with variance calculations.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Detected actual/budget column pattern',
        'Common in financial analysis',
        'Track performance vs targets',
      ],
      impact: {
        kind: 'recipe',
        summary: `Creates variance table with absolute and % variance`,
      },
      action: {
        kind: 'launchRecipe',
        recipeId: 'variance_analysis',
        initialBindings: {
          actualColumnId: actualCol.id,
          budgetColumnId: budgetCol.id,
        },
      },
    };
  },
  score: (_ctx, _meta) => 90,
});

// ============================================================================
// Period-over-Period Rule
// ============================================================================

registerRule({
  id: 'period_over_period',
  category: 'recipe',
  scope: 'table',
  when: (_ctx, meta) => {
    const hasDate = meta.schema.columns.some(c => c.type === 'date' || c.type === 'datetime');
    const hasNumeric = meta.schema.columns.filter(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      return isAnalyzableNumeric(c, profile);
    }).length > 0;
    return hasDate && hasNumeric;
  },
  build: (ctx, meta) => {
    const dateCol = meta.schema.columns.find(c => c.type === 'date' || c.type === 'datetime')!;
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      return isAnalyzableNumeric(c, profile);
    })!;
    
    return {
      id: createSuggestionId('period_over_period', ctx.tableId, numericCol.id),
      category: 'recipe',
      scope: 'table',
      title: 'Period-over-Period Analysis',
      description: `Calculate changes between time periods for ${numericCol.name}.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has time and value data',
        'Compare performance across periods',
        'Calculate growth rates',
      ],
      impact: {
        kind: 'recipe',
        summary: `Creates table with period comparisons`,
      },
      action: {
        kind: 'launchRecipe',
        recipeId: 'period_over_period',
        initialBindings: {
          dateColumnId: dateCol.id,
          valueColumnId: numericCol.id,
        },
      },
    };
  },
  score: (_ctx, _meta) => 60,
});

// ============================================================================
// Ratio KPI Rule
// ============================================================================

registerRule({
  id: 'ratio_kpi',
  category: 'recipe',
  scope: 'table',
  when: (ctx, meta) => {
    const numericCols = meta.schema.columns.filter(c => c.type === 'number');
    if (numericCols.length < 2) return false;
    
    if (ctx.existingDerivedTables?.some(dt => dt.transformType === 'calculated_column')) {
      return false;
    }
    
    const name1 = numericCols[0].name.toLowerCase();
    const name2 = numericCols[1].name.toLowerCase();
    
    return (
      (name1.includes('gross') && name2.includes('revenue')) ||
      (name1.includes('profit') && name2.includes('revenue')) ||
      (name1.includes('cost') && name2.includes('revenue')) ||
      (name1.includes('net') && name2.includes('gross')) ||
      (name1.includes('margin') || name2.includes('margin'))
    );
  },
  build: (ctx, meta) => {
    const numericCols = meta.schema.columns.filter(c => c.type === 'number');
    const [num1, num2] = numericCols;
    // Use column name (what DuckDB expects) for derived tables
    const num1Ref = num1.name || num1.id;
    const num2Ref = num2.name || num2.id;
    
    return {
      id: createSuggestionId('ratio_kpi', ctx.tableId, num1.id, num2.id),
      category: 'recipe',
      scope: 'table',
      title: `Calculate ${num1.name} / ${num2.name} Ratio`,
      description: `Create a ratio KPI from these related metrics.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Detected related numeric columns',
        'Ratios normalize for comparison',
        'Common business KPI pattern',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Adds calculated ratio column`,
      },
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
    };
  },
  score: (_ctx, _meta) => 65,
});
