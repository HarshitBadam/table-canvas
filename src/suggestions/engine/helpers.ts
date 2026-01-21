/**
 * Suggestion Engine Helpers
 * 
 * Utility functions for the suggestion engine.
 */

import type { SuggestionEngineContext } from './types'
import { generateTableVersionHash } from '../suggestionsStore'

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a deterministic suggestion ID based on rule and context.
 * This ensures the same suggestion always has the same ID across regenerations.
 */
export function createSuggestionId(
  ruleId: string,
  tableId: string,
  columnId?: string,
  extra?: string
): string {
  const parts = [ruleId, tableId]
  if (columnId) parts.push(columnId)
  if (extra) parts.push(extra)
  return parts.join(':')
}

// ============================================================================
// Version Hash
// ============================================================================

/**
 * Get or compute the version hash for a table.
 */
export function getVersionHash(ctx: SuggestionEngineContext): string {
  return ctx.tableVersionHash ?? generateTableVersionHash(
    ctx.tableId,
    ctx.profile?.rowCount ?? 0,
    ctx.schema.columns.length,
    undefined
  )
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Convert a numeric score to a confidence level.
 * High: score >= 80, Medium: 50-79, Low: < 50
 */
export function scoreToConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}
