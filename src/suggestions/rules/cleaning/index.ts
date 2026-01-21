/**
 * Cleaning Rules
 * 
 * Rules for data cleaning suggestions (whitespace, casing, dates, outliers).
 */

import type { SuggestionRule } from '../../engine/types'
import { whitespaceRules } from './whitespace'
import { casingRules } from './casing'
import { dateRules } from './dates'
import { outlierRules } from './outliers'

/**
 * All cleaning rules.
 */
export const cleaningRules: SuggestionRule[] = [
  ...whitespaceRules,
  ...casingRules,
  ...dateRules,
  ...outlierRules,
]

// Re-export individual modules
export * from './whitespace'
export * from './casing'
export * from './dates'
export * from './outliers'
