/**
 * Analysis Rules
 * 
 * Suggestion rules for data analysis and visualization.
 */

import { registerRule, createSuggestionId, getVersionHash } from '../registry';
import { classifyColumn } from '../classification';


registerRule({
  id: 'trend_chart',
  category: 'analysis',
  scope: 'table',
  when: (_ctx, meta) => {
    const hasDate = meta.schema.columns.some(c => c.type === 'date' || c.type === 'datetime');
    const hasNumeric = meta.schema.columns.some(c => c.type === 'number');
    return hasDate && hasNumeric;
  },
  build: (ctx, meta) => {
    const dateCol = meta.schema.columns.find(c => c.type === 'date' || c.type === 'datetime')!;
    const numericCol = meta.schema.columns.find(c => c.type === 'number')!;
    // Use column ID (what DuckDB uses internally) for derived tables
    const dateColRef = dateCol.id;
    const numericColRef = numericCol.id;
    
    return {
      id: createSuggestionId('trend_chart', ctx.tableId, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `${numericCol.name} trend over time`,
      description: `Visualize how ${numericCol.name} changes over ${dateCol.name}.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has date and numeric columns',
        'Time series analysis reveals trends',
        'Identify patterns and seasonality',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates line chart`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'line',
          sourceTableId: ctx.tableId,
          title: `${numericCol.name} over ${dateCol.name}`,
          config: {
            xAxis: dateColRef,
            yAxis: numericColRef,
            aggregation: 'sum',
          },
        },
        addToDashboard: false,
      },
    };
  },
  score: (_ctx, _meta) => 85,
});


registerRule({
  id: 'category_breakdown',
  category: 'analysis',
  scope: 'table',
  when: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0;
    
    // Find a suitable categorical column using classification
    const hasCategorical = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat';
    });
    
    // Find a suitable numeric column (continuous or discrete, but not ID)
    const hasNumeric = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'continuous_numeric' || classification === 'discrete_numeric';
    });
    
    return hasCategorical && hasNumeric;
  },
  build: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0;
    
    // Find the best categorical column
    const catCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat';
    })!;
    
    // Find the best numeric column
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'continuous_numeric' || classification === 'discrete_numeric';
    })!;
    
    // Use column name (what DuckDB expects) for derived tables
    const catColRef = catCol.name || catCol.id;
    const numericColRef = numericCol.name || numericCol.id;
    
    return {
      id: createSuggestionId('category_breakdown', ctx.tableId, catCol.id),
      category: 'analysis',
      scope: 'table',
      title: `${numericCol.name} by ${catCol.name}`,
      description: `Break down ${numericCol.name} by ${catCol.name} categories.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has categorical and numeric columns',
        'Understand composition by category',
        'Identify top contributors',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates bar chart with ${meta.profile?.columns.find(p => p.columnId === catCol.id)?.distinctCount ?? 'multiple'} categories`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'bar',
          sourceTableId: ctx.tableId,
          title: `${numericCol.name} by ${catCol.name}`,
          config: {
            xAxis: catColRef,
            yAxis: numericColRef,
            aggregation: 'sum',
            groupBy: catColRef,
          },
        },
        addToDashboard: false,
      },
    };
  },
  score: (_ctx, _meta) => 80,
});


registerRule({
  id: 'distribution_histogram',
  category: 'analysis',
  scope: 'column',
  when: (ctx, meta) => {
    if (!meta.column || meta.column.type !== 'number') return false;
    if (!meta.columnProfile) return false;
    if (meta.columnProfile.min === undefined || meta.columnProfile.max === undefined) return false;
    
    // Use classification to ensure we only suggest histograms for continuous numeric data
    const classification = classifyColumn(
      meta.column, 
      meta.columnProfile, 
      ctx.profile?.rowCount ?? 0
    );
    
    // Only suggest histogram for continuous numeric data (not IDs or discrete)
    return classification === 'continuous_numeric';
  },
  build: (ctx, meta) => {
    // Use column ID (what DuckDB uses internally) for derived tables
    const colRef = meta.column!.id;
    return {
      id: createSuggestionId('distribution_histogram', ctx.tableId, meta.column!.id),
      category: 'analysis',
      scope: 'column',
      title: `Distribution of ${meta.column!.name}`,
      description: `Analyze the distribution from ${meta.columnProfile!.min?.toLocaleString()} to ${meta.columnProfile!.max?.toLocaleString()}.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Numeric column with defined range',
        'Understand value distribution',
        'Identify outliers and patterns',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates histogram`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'histogram',
          sourceTableId: ctx.tableId,
          title: `Distribution of ${meta.column!.name}`,
          config: {
            xAxis: colRef,
            aggregation: 'count',
          },
        },
        addToDashboard: false,
      },
    };
  },
  score: (_ctx, _meta) => 70,
});


registerRule({
  id: 'top_n_analysis',
  category: 'analysis',
  scope: 'table',
  when: (_ctx, meta) => {
    const hasCategorical = meta.schema.columns.some(c => 
      c.type === 'string' && 
      (meta.profile?.columns.find(p => p.columnId === c.id)?.distinctCount ?? 100) < 50
    );
    const hasNumeric = meta.schema.columns.some(c => c.type === 'number');
    return hasCategorical && hasNumeric;
  },
  build: (ctx, meta) => {
    const catCol = meta.schema.columns.find(c => 
      c.type === 'string' && 
      (meta.profile?.columns.find(p => p.columnId === c.id)?.distinctCount ?? 100) < 50
    )!;
    const numericCol = meta.schema.columns.find(c => c.type === 'number')!;
    // Use column ID (what DuckDB uses internally) for derived tables
    const catColRef = catCol.id;
    const numericColRef = numericCol.id;
    
    return {
      id: createSuggestionId('top_n_analysis', ctx.tableId, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `Top contributors to ${numericCol.name}`,
      description: `Identify which ${catCol.name} values contribute most to total ${numericCol.name}.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Pareto analysis (80/20 rule)',
        'Focus on high-impact items',
        'Prioritize attention effectively',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates ranked summary table`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [catColRef],
          aggregations: [{
            columnId: numericColRef,
            operation: 'sum',
            alias: `total_${numericCol.name}`,
          }],
        },
        tableName: `Top ${catCol.name} by ${numericCol.name}`,
        openAfterApply: true,
      },
    };
  },
  score: (_ctx, _meta) => 65,
});


registerRule({
  id: 'create_summary_fallback',
  category: 'analysis',
  scope: 'table',
  when: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0;
    
    const hasCategorical = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat' || classification === 'high_cardinality_cat';
    });
    
    const hasNumeric = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'continuous_numeric' || classification === 'discrete_numeric';
    });
    
    return hasCategorical && hasNumeric;
  },
  build: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0;
    
    const stringCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat';
    }) || meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'high_cardinality_cat';
    })!;
    
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'continuous_numeric' || classification === 'discrete_numeric';
    })!;
    
    // Use column ID (what DuckDB uses internally) for derived tables
    const stringColRef = stringCol.id;
    const numericColRef = numericCol.id;
    
    return {
      id: createSuggestionId('create_summary_fallback', ctx.tableId, stringCol.id, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `Summarize ${numericCol.name} by ${stringCol.name}`,
      description: `Group data and calculate totals.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has text and numeric columns',
        'Grouping reveals patterns',
        'Common analysis starting point',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates summary table`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [stringColRef],
          aggregations: [
            { columnId: numericColRef, operation: 'sum', alias: `Total ${numericCol.name}` },
            { columnId: numericColRef, operation: 'count', alias: 'Count' },
          ],
        },
        tableName: `${ctx.tableName} (Summary)`,
        openAfterApply: true,
      },
    };
  },
  score: (_ctx, _meta) => 60,
});


registerRule({
  id: 'bar_chart_fallback',
  category: 'analysis',
  scope: 'table',
  when: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0;
    
    const hasCategorical = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat' || classification === 'high_cardinality_cat';
    });
    
    const hasNumeric = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'continuous_numeric' || classification === 'discrete_numeric';
    });
    
    return hasCategorical && hasNumeric;
  },
  build: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0;
    
    const stringCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat';
    }) || meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'high_cardinality_cat';
    })!;
    
    const numericCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'continuous_numeric' || classification === 'discrete_numeric';
    })!;
    
    // Use column ID (what DuckDB uses internally) for derived tables
    const stringColRef = stringCol.id;
    const numericColRef = numericCol.id;
    
    return {
      id: createSuggestionId('bar_chart_fallback', ctx.tableId, stringCol.id, numericCol.id),
      category: 'analysis',
      scope: 'table',
      title: `Chart: ${numericCol.name} by ${stringCol.name}`,
      description: `Visualize values grouped by category.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Table has categorical and numeric data',
        'Charts reveal distribution patterns',
        'Great for presentations',
      ],
      impact: {
        kind: 'chart',
        summary: `Creates bar chart`,
      },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'bar',
          sourceTableId: ctx.tableId,
          title: `${numericCol.name} by ${stringCol.name}`,
          config: {
            xAxis: stringColRef,
            yAxis: numericColRef,
            aggregation: 'sum',
          },
        },
        addToDashboard: false,
      },
    };
  },
  score: (_ctx, _meta) => 55,
});


registerRule({
  id: 'detect_type_issues_fallback',
  category: 'cleaning',
  scope: 'table',
  when: (_ctx, meta) => {
    return meta.schema.columns.some(c => {
      const name = c.name.toLowerCase();
      if ((name.includes('date') || name.includes('time') || name.includes('created') || 
           name.includes('updated') || name.includes('at')) && 
          c.type !== 'date' && c.type !== 'datetime') {
        return true;
      }
      if ((name.includes('id') || name.includes('code') || name.includes('key')) && 
          c.type === 'number') {
        return true;
      }
      return false;
    });
  },
  build: (ctx, meta) => {
    const suspectCols = meta.schema.columns.filter(c => {
      const name = c.name.toLowerCase();
      return (name.includes('date') || name.includes('id') || name.includes('code')) &&
             c.type !== 'date' && c.type !== 'datetime';
    });
    
    return {
      id: createSuggestionId('review_column_types', ctx.tableId),
      category: 'cleaning',
      scope: 'table',
      title: `Review column types`,
      description: `Some columns may have incorrect types: ${suspectCols.slice(0, 2).map(c => c.name).join(', ')}`,
      confidence: 'low',
      context: {
        tableId: ctx.tableId,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Column names suggest different types',
        'Correct types enable better analysis',
        'May improve filtering and sorting',
      ],
      impact: {
        kind: 'patch',
        summary: `Manual review recommended`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'source',
      },
    };
  },
  score: (_ctx, _meta) => 40,
});
