/**
 * Whitespace Cleaning Rules
 * 
 * Rules for detecting and cleaning whitespace issues.
 */

import type { SuggestionRule } from '../../engine/types'
import { createSuggestionId, getVersionHash } from '../helpers'

/**
 * Check if a value has leading or trailing whitespace.
 */
export function hasLeadingTrailingWhitespace(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value)
  return str !== str.trim()
}

/**
 * Rule: Trim whitespace from string values.
 */
export const trimWhitespaceRule: SuggestionRule = {
  id: 'trim_whitespace',
  category: 'cleaning',
  scope: 'column',
  
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    return meta.columnProfile.topValues.some(v => hasLeadingTrailingWhitespace(v.value))
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
  
  score: () => 85,
}

/**
 * All whitespace cleaning rules.
 */
export const whitespaceRules: SuggestionRule[] = [
  trimWhitespaceRule,
]
