import { registerRule, createSuggestionId, getVersionHash } from '../registry';
import {
  looksLikeNumber,
  detectDateFormats,
  looksLikeTimestamp,
} from '../detection';


registerRule({
  id: 'convert_to_date',
  category: 'cleaning',
  scope: 'column',
  // Disabled until calculated-column transforms expose a safe one-argument
  // string-to-date coercion. DATE() requires year, month and day.
  when: () => false,
  build: (ctx, meta) => ({
    id: createSuggestionId('convert_to_date', ctx.tableId, meta.column?.id),
    category: 'cleaning',
    scope: 'column',
    title: `Convert "${meta.column!.name}" to date`,
    description: `This column contains date-like strings that can be converted to proper dates.`,
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
    },
    why: [
      'Values match common date patterns',
      'Date type enables time-based analysis',
      'Proper sorting and filtering by date',
    ],
    impact: {
      kind: 'derivedTable',
      summary: `Converts column to date type`,
    },
    action: {
      kind: 'createDerivedTable',
      transform: {
        type: 'calculated_column',
        sourceTableId: ctx.tableId,
        newColumnName: `${meta.column!.name}_date`,
        expression: `DATE("${meta.column!.id}")`,
      },
      tableName: `${ctx.tableName} (with dates)`,
      openAfterApply: true,
    },
  }),
  score: (_ctx, _meta) => 80,
});


registerRule({
  id: 'convert_to_number',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues?.length) return false;
    
    const numericCount = meta.columnProfile.topValues.filter(v => 
      v.value === null || looksLikeNumber(v.value)
    ).length;
    
    return numericCount >= meta.columnProfile.topValues.length * 0.8;
  },
  build: (ctx, meta) => ({
    id: createSuggestionId('convert_to_number', ctx.tableId, meta.column?.id),
    category: 'cleaning',
    scope: 'column',
    title: `Convert "${meta.column!.name}" to number`,
    description: `This column contains numeric values stored as text.`,
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
    },
    why: [
      'Values appear to be numeric',
      'Enables mathematical operations',
      'Proper numeric sorting and comparisons',
    ],
    impact: {
      kind: 'derivedTable',
      summary: `Converts column to numeric type`,
    },
    action: {
      kind: 'createDerivedTable',
      transform: {
        type: 'calculated_column',
        sourceTableId: ctx.tableId,
        newColumnName: `${meta.column!.name}_num`,
        expression: `NUMBER("${meta.column!.id}")`,
      },
      tableName: `${ctx.tableName} (converted)`,
      openAfterApply: true,
    },
  }),
  score: (_ctx, _meta) => 82,
});


registerRule({
  id: 'standardize_date_format',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    const formats = detectDateFormats(meta.columnProfile.topValues);
    return formats.size > 1;
  },
  build: (ctx, meta) => {
    const formats = detectDateFormats(meta.columnProfile!.topValues!);
    
    return {
      id: createSuggestionId('standardize_date_format', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Standardize date format in "${meta.column!.name}"`,
      description: `Found ${formats.size} different date formats: ${Array.from(formats).join(', ')}`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'standardize_date', outputFormat: '%Y-%m-%d' },
      },
      why: [
        `Detected ${formats.size} different date formats`,
        'Inconsistent formats cause sorting issues',
        'Standardizing to ISO format (YYYY-MM-DD)',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Standardizes dates to YYYY-MM-DD format`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    };
  },
  score: (_ctx, _meta) => 90,
});


registerRule({
  id: 'numeric_timestamp',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'number') return false;
    if (!meta.columnProfile) return false;
    
    return looksLikeTimestamp(meta.columnProfile.min, meta.columnProfile.max) !== null;
  },
  build: (ctx, meta) => {
    const unit = looksLikeTimestamp(meta.columnProfile!.min, meta.columnProfile!.max)!;
    const minDate = new Date(unit === 'milliseconds' ? meta.columnProfile!.min! : meta.columnProfile!.min! * 1000);
    const maxDate = new Date(unit === 'milliseconds' ? meta.columnProfile!.max! : meta.columnProfile!.max! * 1000);
    
    return {
      id: createSuggestionId('epoch_to_date', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Convert "${meta.column!.name}" to date`,
      description: `This column contains ${unit} timestamps (${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]})`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'epoch_to_date', unit },
      },
      why: [
        `Values are Unix timestamps (${unit})`,
        `Range: ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`,
        'Converting enables date-based analysis',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Converts timestamps to proper dates`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    };
  },
  score: (_ctx, _meta) => 88,
});
