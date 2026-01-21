/**
 * Suggestion Rules
 * 
 * All suggestion rules organized by category.
 */

import type { SuggestionRule } from '../engine/types'
import { cleaningRules } from './cleaning'
import { analysisRules } from './analysis'
import { recipeRules } from './recipes'

/**
 * All registered rules.
 */
export const allRules: SuggestionRule[] = [
  ...cleaningRules,
  ...analysisRules,
  ...recipeRules,
]

// Re-export by category
export { cleaningRules } from './cleaning'
export { analysisRules } from './analysis'
export { recipeRules } from './recipes'

// Re-export helpers
export * from './helpers'
