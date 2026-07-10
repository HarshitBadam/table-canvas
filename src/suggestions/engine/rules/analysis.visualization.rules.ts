import { registerRule, createSuggestionId, getVersionHash } from '../registry';
import { classifyColumn } from '../classification';


registerRule({
  id: 'distribution_histogram',
  category: 'analysis',
  scope: 'column',
  when: (ctx, meta) => {
    if (!meta.column || meta.column.type !== 'number') return false;
    if (!meta.columnProfile) return false;
    if (meta.columnProfile.min === undefined || meta.columnProfile.max === undefined) return false;
    
    const classification = classifyColumn(
      meta.column, 
      meta.columnProfile, 
      ctx.profile?.rowCount ?? 0
    );
    
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
  id: 'boolean_breakdown',
  category: 'analysis',
  scope: 'column',
  when: (_ctx, meta) =>
    meta.column?.type === 'boolean' && (meta.columnProfile?.distinctCount ?? 0) > 0,
  build: (ctx, meta) => ({
    id: createSuggestionId('boolean_breakdown', ctx.tableId, meta.column!.id),
    category: 'analysis',
    scope: 'column',
    title: `${meta.column!.name} breakdown`,
    description: 'Compare true and false record counts.',
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
    },
    why: [
      'Boolean values are naturally categorical',
      'A count breakdown makes imbalance easy to see',
    ],
    impact: {
      kind: 'chart',
      summary: 'Creates a two-category pie chart',
    },
    action: {
      kind: 'createChart',
      chart: {
        chartType: 'pie',
        sourceTableId: ctx.tableId,
        title: `${meta.column!.name} breakdown`,
        config: {
          xAxis: meta.column!.id,
          aggregation: 'count',
        },
      },
      addToDashboard: false,
    },
  }),
  score: () => 76,
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
  // Disabled: this was a manual-review message wired to an empty patch action,
  // which created a meaningless table copy when applied.
  when: () => false,
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
