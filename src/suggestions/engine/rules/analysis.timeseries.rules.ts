import { registerRule, createSuggestionId, getVersionHash } from '../registry';


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
