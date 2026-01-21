/**
 * Recipe Rules
 * 
 * Multi-step analysis recipes (variance, time series).
 */

import type { SuggestionRule } from '../../engine/types'
import { varianceRules } from './variance'
import { timeSeriesRules } from './timeSeries'

/**
 * All recipe rules.
 */
export const recipeRules: SuggestionRule[] = [
  ...varianceRules,
  ...timeSeriesRules,
]

// Re-export individual modules
export * from './variance'
export * from './timeSeries'
