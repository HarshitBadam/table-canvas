/**
 * Outlier Detection Rules
 * 
 * Rules for detecting and handling outliers in numeric columns.
 */

import type { ColumnProfile } from '@/lib/types'
import type { SuggestionRule } from '../../engine/types'
import { createSuggestionId, getVersionHash, isAnalyzableNumeric } from '../helpers'

/**
 * Detect outliers using IQR method.
 * Returns the number of potential outliers.
 */
export function detectOutliers(profile?: ColumnProfile): {
  count: number
  threshold: { lower: number; upper: number } | null
} {
  if (!profile || profile.min === undefined || profile.max === undefined) {
    return { count: 0, threshold: null }
  }
  
  // Simple outlier detection using range vs standard deviation
  if (profile.stdDev === undefined || profile.mean === undefined) {
    return { count: 0, threshold: null }
  }
  
  const mean = profile.mean
  const stdDev = profile.stdDev
  
  // 3 standard deviations rule
  const lower = mean - 3 * stdDev
  const upper = mean + 3 * stdDev
  
  // Check if min/max are outside bounds
  let count = 0
  if (profile.min < lower) count++
  if (profile.max > upper) count++
  
  return {
    count,
    threshold: { lower, upper },
  }
}

/**
 * Rule: Flag potential outliers in numeric columns.
 */
export const flagOutliersRule: SuggestionRule = {
  id: 'flag_outliers',
  category: 'cleaning',
  scope: 'column',
  
  when: (_ctx, meta) => {
    if (!meta.column || !isAnalyzableNumeric(meta.column, meta.columnProfile)) return false
    
    const { count } = detectOutliers(meta.columnProfile)
    return count > 0
  },
  
  build: (ctx, meta) => {
    const { count, threshold } = detectOutliers(meta.columnProfile)
    
    return {
      id: createSuggestionId('flag_outliers', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Review outliers in "${meta.column!.name}"`,
      description: `Detected ${count} potential outlier(s) outside expected range.`,
      confidence: 'medium',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
        outlierInfo: {
          count,
          threshold,
          min: meta.columnProfile?.min,
          max: meta.columnProfile?.max,
          mean: meta.columnProfile?.mean,
          stdDev: meta.columnProfile?.stdDev,
        },
      },
      why: [
        `Values found outside ±3σ from mean`,
        'Outliers can skew statistical analysis',
        'May indicate data entry errors',
      ],
      impact: {
        kind: 'patch',
        summary: `Highlights ${count} value(s) for review`,
      },
      action: {
        kind: 'highlightCells',
        cells: [],  // Will be populated during apply
        target: 'source',
      },
    }
  },
  
  score: (_ctx, meta) => {
    const { count } = detectOutliers(meta.columnProfile)
    // Higher score for more outliers
    return Math.min(70, 50 + count * 10)
  },
}

/**
 * All outlier detection rules.
 */
export const outlierRules: SuggestionRule[] = [
  flagOutliersRule,
]
