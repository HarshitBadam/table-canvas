import { registerRule, createSuggestionId, getVersionHash } from '../registry';
import { classifyColumn } from '../classification';


registerRule({
  id: 'category_breakdown',
  category: 'analysis',
  scope: 'table',
  when: (ctx, meta) => {
    const rowCount = ctx.profile?.rowCount ?? 0;
    
    const hasCategorical = meta.schema.columns.some(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat';
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
    
    const catCol = meta.schema.columns.find(c => {
      const profile = meta.profile?.columns.find(p => p.columnId === c.id);
      const classification = classifyColumn(c, profile, rowCount);
      return classification === 'low_cardinality_cat';
    })!;
    
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
