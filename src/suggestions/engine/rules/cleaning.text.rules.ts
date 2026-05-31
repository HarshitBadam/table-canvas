import { registerRule, createSuggestionId, getVersionHash } from '../registry';
import {
  hasLeadingTrailingWhitespace,
  looksLikeIdColumn,
  hasMixedCase,
  getMixedCaseVariants,
  hasConsistentDelimiter,
  findTypos,
} from '../detection';


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


registerRule({
  id: 'normalize_casing',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false;
    
    // Only trigger on low-cardinality categoricals; high-cardinality columns have intentionally varied casing
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


registerRule({
  id: 'detect_typos',
  category: 'cleaning',
  scope: 'column',
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false;
    if (!meta.columnProfile?.topValues) return false;
    
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false;
    
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
