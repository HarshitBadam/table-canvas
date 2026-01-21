/**
 * Analysis Rules
 * 
 * Rules for data analysis suggestions (charts, aggregations).
 */

import type { SuggestionRule } from '../../engine/types'
import { chartRules } from './charts'
import { aggregationRules } from './aggregation'

/**
 * All analysis rules.
 */
export const analysisRules: SuggestionRule[] = [
  ...chartRules,
  ...aggregationRules,
]

// Re-export individual modules
export * from './charts'
export * from './aggregation'
