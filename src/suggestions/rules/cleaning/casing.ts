/**
 * Casing Cleaning Rules
 * 
 * Rules for detecting and normalizing inconsistent casing.
 */

import type { SuggestionRule } from '../../engine/types'
import { createSuggestionId, getVersionHash, looksLikeIdColumn } from '../helpers'

interface TopValue {
  value: unknown
  count: number
}

/**
 * Check if values have mixed casing (same word, different cases).
 */
export function hasMixedCase(topValues: TopValue[]): boolean {
  const normalized = new Map<string, string[]>()
  
  for (const v of topValues) {
    if (v.value === null || v.value === undefined) continue
    const str = String(v.value)
    const lower = str.toLowerCase().trim()
    
    if (!normalized.has(lower)) {
      normalized.set(lower, [])
    }
    normalized.get(lower)!.push(str)
  }
  
  // Check if any normalized value has multiple case variants
  for (const variants of normalized.values()) {
    const unique = new Set(variants)
    if (unique.size > 1) return true
  }
  
  return false
}

/**
 * Get mappings of mixed case variants to canonical form.
 */
export function getMixedCaseVariants(topValues: TopValue[]): Record<string, string[]> {
  const normalized = new Map<string, { canonical: string; variants: string[] }>()
  
  for (const v of topValues) {
    if (v.value === null || v.value === undefined) continue
    const str = String(v.value)
    const lower = str.toLowerCase().trim()
    
    if (!normalized.has(lower)) {
      // Use first occurrence as canonical
      normalized.set(lower, { canonical: str, variants: [] })
    } else {
      const entry = normalized.get(lower)!
      if (!entry.variants.includes(str) && str !== entry.canonical) {
        entry.variants.push(str)
      }
    }
  }
  
  // Return only entries with variants
  const result: Record<string, string[]> = {}
  for (const [, entry] of normalized) {
    if (entry.variants.length > 0) {
      result[entry.canonical] = entry.variants
    }
  }
  
  return result
}

/**
 * Rule: Normalize inconsistent casing in categorical columns.
 */
export const normalizeCasingRule: SuggestionRule = {
  id: 'normalize_casing',
  category: 'cleaning',
  scope: 'column',
  
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    // Skip ID-like columns
    if (looksLikeIdColumn(meta.column, meta.columnProfile)) return false
    
    // Apply to low-cardinality string columns (< 30 distinct values)
    if ((meta.columnProfile.distinctCount ?? 100) > 30) return false
    
    return hasMixedCase(meta.columnProfile.topValues)
  },
  
  build: (ctx, meta) => {
    const mappings = getMixedCaseVariants(meta.columnProfile!.topValues!)
    const variants = Object.keys(mappings)
    
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
    }
  },
  
  score: (_ctx, meta) => {
    const distinctCount = meta.columnProfile?.distinctCount ?? 100
    return distinctCount < 10 ? 75 : 55
  },
}

/**
 * All casing cleaning rules.
 */
export const casingRules: SuggestionRule[] = [
  normalizeCasingRule,
]
