/**
 * Cleaning Rules
 * 
 * Suggestion rules for data cleaning operations.
 */

import { registerRule, createSuggestionId, getVersionHash, SuggestionEngineContext, MetadataBundle } from '../registry';
import { 
  hasLeadingTrailingWhitespace,
  looksLikeNumber,
  looksLikeIdColumn,
  hasMixedCase,
  getMixedCaseVariants,
  looksLikeDate,
  detectDateFormats,
  looksLikeTimestamp,
  hasConsistentDelimiter,
  findTypos,
  findPlaceholders,
  detectOutliers,
} from '../detection';

// ============================================================================
// Trim Whitespace Rule
// ============================================================================

registerRule({
  id: 'trim_whitespace',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    return meta.columnProfile.topValues.some(v => hasLeadingTrailingWhitespace(v.value));
  },
  build: (ctx, meta) => ({
    id: createSuggestionId('trim_whitespace', ctx.tableId, meta.column?.id),
    category: 'cleaning',
    scope: 'column',
    title: `Trim whitespace in "${meta.column!.name}"`,
    description: `Remove leading/trailing spaces that may cause matching issues.`,
    confidence: 'high',
    context: {
      tableId: ctx.tableId,
      columnId: meta.column!.id,
      tableVersionHash: getVersionHash(ctx),
      cleaningOperation: { type: 'trim' },
    },
    why: [
      'Detected leading or trailing spaces in values',
      'Whitespace can cause join mismatches',
      'May affect grouping and filtering',
    ],
    impact: {
      kind: 'derivedTable',
      summary: `Creates cleaned copy with trimmed values`,
    },
    action: {
      kind: 'applyPatch',
      ops: [],
      target: 'cleanCopy',
    },
  }),
  score: (_ctx, _meta) => 85,
});

// ============================================================================
// Normalize Casing Rule
// ============================================================================

registerRule({
  id: 'normalize_casing',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    // Skip ID-like columns
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false;
    
    // Apply to any low-cardinality string column (< 30 distinct values)
    if ((meta.columnProfile.distinctCount ?? 100) > 30) return false;
    
    return hasMixedCase(meta.columnProfile.topValues);
  },
  build: (ctx, meta) => {
    const mappings = getMixedCaseVariants(meta.columnProfile!.topValues!);
    const variants = Object.keys(mappings);
    
    return {
      id: createSuggestionId('normalize_case', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Normalize casing in "${meta.column!.name}"`,
      description: `Found ${variants.length} case variant(s): ${variants.slice(0, 3).map(v => `"${v}"`).join(', ')}${variants.length > 3 ? '...' : ''}`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'normalize_case', mappings },
      },
      why: [
        'Detected inconsistent casing across values',
        'This column appears to be categorical',
        'Consistent casing improves grouping accuracy',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Normalizes ${variants.length} case variant(s) to canonical form`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    };
  },
  score: (_ctx, meta) => {
    const distinctCount = meta.columnProfile?.distinctCount ?? 100;
    return distinctCount < 10 ? 75 : 55;
  },
});

// ============================================================================
// Convert to Date Rule
// ============================================================================

registerRule({
  id: 'convert_to_date',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    const dateLikeCount = meta.columnProfile.topValues.filter(v => 
      looksLikeDate(v.value)
    ).length;
    
    return dateLikeCount >= meta.columnProfile.topValues.length * 0.7;
  },
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

// ============================================================================
// Convert to Number Rule
// ============================================================================

registerRule({
  id: 'convert_to_number',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
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

// ============================================================================
// Fill Missing Values Rule
// ============================================================================

registerRule({
  id: 'fill_missing',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.columnProfile) return false;
    return meta.columnProfile.missingPercent > 5 && meta.columnProfile.missingPercent < 100;
  },
  build: (ctx, meta) => {
    const isNumeric = meta.column?.type === 'number';
    const fillMethod = isNumeric ? 'mean' : 'Unknown';
    
    return {
      id: createSuggestionId('fill_missing', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Fill missing values in "${meta.column!.name}"`,
      description: `${meta.columnProfile!.missingPercent.toFixed(1)}% of values are missing. Fill with ${fillMethod}.`,
      confidence: meta.columnProfile!.missingPercent > 20 ? 'high' : 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: isNumeric 
          ? { type: 'fill_missing_numeric', strategy: 'mean' as const }
          : { type: 'fill_missing_string', value: 'Unknown' },
      },
      why: [
        `${meta.columnProfile!.missingPercent.toFixed(1)}% values are missing`,
        'Missing data can affect calculations',
        'May cause issues in joins and aggregations',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Fills ${meta.columnProfile!.missingCount} missing values`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    };
  },
  score: (_ctx, meta) => {
    const missing = meta.columnProfile?.missingPercent ?? 0;
    if (missing > 30) return 85;
    if (missing > 15) return 70;
    return 55;
  },
});

// ============================================================================
// Find Duplicates Rule
// ============================================================================

registerRule({
  id: 'find_duplicates',
  category: 'cleaning',
  scope: 'column',
  when: (ctx, meta) => {
    if (!meta.column?.semanticHints?.includes('id')) return false;
    if (!meta.columnProfile || !ctx.profile) return false;
    
    return meta.columnProfile.distinctCount < ctx.profile.rowCount;
  },
  build: (ctx, meta) => {
    const dupCount = ctx.profile!.rowCount - meta.columnProfile!.distinctCount;
    const dupRate = (dupCount / ctx.profile!.rowCount * 100).toFixed(1);
    
    return {
      id: createSuggestionId('find_duplicates', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Find duplicates in "${meta.column!.name}"`,
      description: `This ID column has ${dupRate}% duplicate values (${dupCount} rows).`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `Found ${dupCount} duplicate ID values`,
        'ID columns should typically be unique',
        'May indicate data quality issues',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Creates deduplicated table`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'group_summarize',
          sourceTableId: ctx.tableId,
          groupByColumns: [meta.column!.id],
          aggregations: ctx.schema.columns
            .filter(c => c.id !== meta.column!.id)
            .slice(0, 5)
            .map(c => ({
              columnId: c.id,
              operation: c.type === 'number' ? 'sum' as const : 'count' as const,
              alias: c.type === 'number' ? `${c.name}_total` : `${c.name}_count`,
            })),
        },
        tableName: `${ctx.tableName} (deduplicated)`,
        openAfterApply: true,
      },
    };
  },
  score: (ctx, meta) => {
    const dupRate = (ctx.profile!.rowCount - meta.columnProfile!.distinctCount) / ctx.profile!.rowCount;
    return dupRate > 0.1 ? 90 : 70;
  },
});

// ============================================================================
// Split Delimiter Rule
// ============================================================================

registerRule({
  id: 'split_delimiter',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    return hasConsistentDelimiter(meta.columnProfile.topValues) !== null;
  },
  build: (ctx, meta) => {
    const delimiter = hasConsistentDelimiter(meta.columnProfile!.topValues!)!;
    
    return {
      id: createSuggestionId('split_column', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Split "${meta.column!.name}" by "${delimiter}"`,
      description: `Values contain consistent "${delimiter}" delimiters that can be split into columns.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        `Detected consistent "${delimiter}" delimiter`,
        'Splitting can normalize data structure',
        'Creates separate columns for each part',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Splits into multiple columns`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'calculated_column',
          sourceTableId: ctx.tableId,
          newColumnName: `${meta.column!.name}_split`,
          expression: `SPLIT("${meta.column!.id}", "${delimiter}")`,
        },
        tableName: `${ctx.tableName} (split)`,
        openAfterApply: true,
      },
    };
  },
  score: (_ctx, _meta) => 60,
});

// ============================================================================
// Detect Typos Rule
// ============================================================================

registerRule({
  id: 'detect_typos',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    // Skip ID-like columns - they have intentionally different values
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false;
    
    // Only for categorical columns with reasonable cardinality
    if ((meta.columnProfile.distinctCount ?? 100) > 50) return false;
    
    const typos = findTypos(meta.columnProfile.topValues);
    return typos.length > 0;
  },
  build: (ctx, meta) => {
    const typos = findTypos(meta.columnProfile!.topValues!);
    const mappings: Record<string, string> = {};
    for (const t of typos) {
      mappings[t.from] = t.to;
    }
    
    const examples = typos.slice(0, 2).map(t => `"${t.from}" → "${t.to}"`).join(', ');
    
    return {
      id: createSuggestionId('detect_typos', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Fix typos in "${meta.column!.name}"`,
      description: `Found ${typos.length} possible typo(s): ${examples}`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'replace_typos', mappings },
      },
      why: [
        `Found similar values that may be typos`,
        ...typos.slice(0, 2).map(t => `"${t.from}" (${t.fromCount}x) similar to "${t.to}" (${t.toCount}x)`),
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Corrects ${typos.length} typo(s)`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    };
  },
  score: (_ctx, meta) => {
    const typos = findTypos(meta.columnProfile!.topValues!);
    return typos.length > 2 ? 80 : 65;
  },
});

// ============================================================================
// Detect Placeholders Rule
// ============================================================================

registerRule({
  id: 'detect_placeholders',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    const { placeholders } = findPlaceholders(meta.columnProfile.topValues);
    return placeholders.length > 0;
  },
  build: (ctx, meta) => {
    const { placeholders } = findPlaceholders(meta.columnProfile!.topValues!);
    
    return {
      id: createSuggestionId('detect_placeholders', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Convert placeholders to NULL in "${meta.column!.name}"`,
      description: `Found placeholder value(s) that will be converted to NULL`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'nullify_placeholders', placeholders: [] },
      },
      why: [
        `Found ${placeholders.length} placeholder type(s)`,
        'Placeholders should be proper NULLs',
        'Improves aggregation accuracy',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Converts placeholder(s) to NULL`,
      },
      action: {
        kind: 'applyPatch',
        ops: [],
        target: 'cleanCopy',
      },
    };
  },
  score: (_ctx, _meta) => 85,
});

// ============================================================================
// Standardize Date Format Rule
// ============================================================================

registerRule({
  id: 'standardize_date_format',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    const formats = detectDateFormats(meta.columnProfile.topValues);
    return formats.size > 1;  // Multiple different formats
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

// ============================================================================
// Numeric Timestamp Rule
// ============================================================================

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

// ============================================================================
// Detect Outliers Rule
// ============================================================================

registerRule({
  id: 'detect_outliers',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'number') return false;
    if (!meta.columnProfile) return false;
    
    // Skip ID-like columns
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false;
    
    const result = detectOutliers(meta.columnProfile);
    return result !== null && result.hasOutliers;
  },
  build: (ctx, meta) => {
    const { lowerBound, upperBound } = detectOutliers(meta.columnProfile!)!;
    const { min, max, q1, q3 } = meta.columnProfile!;
    
    const outlierInfo: string[] = [];
    if (min !== undefined && min < lowerBound) outlierInfo.push(`Min (${min.toFixed(2)}) below threshold`);
    if (max !== undefined && max > upperBound) outlierInfo.push(`Max (${max.toFixed(2)}) above threshold`);
    
    return {
      id: createSuggestionId('detect_outliers', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Outliers in "${meta.column!.name}"`,
      description: `Values outside [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}] will be highlighted for review`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        cleaningOperation: { type: 'highlight_outliers', lowerBound, upperBound },
      },
      why: [
        ...outlierInfo,
        `Normal range (IQR): ${q1?.toFixed(1)} to ${q3?.toFixed(1)}`,
        'Review these values - they may be errors or valid edge cases',
      ],
      impact: {
        kind: 'patch',
        summary: `Highlights outlier values for review`,
      },
      action: {
        kind: 'highlightCells',
        cells: [],
        target: 'source',
      },
    };
  },
  score: (_ctx, _meta) => 70,
});
