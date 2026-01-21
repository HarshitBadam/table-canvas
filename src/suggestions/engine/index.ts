/**
 * Suggestion Engine Module
 * 
 * Exports all suggestion engine functionality.
 */

// Core generation functions
export { generateSuggestions, getColumnSuggestions } from './core';

// Registry types and functions
export type { 
  SuggestionEngineContext, 
  MetadataBundle,
  SuggestionRule,
} from './registry';
export { 
  registerRule, 
  getRules, 
  getTableRules, 
  getColumnRules,
  createSuggestionId,
  getVersionHash,
} from './registry';

// Classification functions
export {
  classifyColumn,
  isUniqueIdentifier,
  classifyNumericColumn,
  classifyStringColumn,
  isAnalyzableNumeric,
  isGroupableCategory,
  looksLikeCategoryByName,
} from './classification';

// Detection utilities
export {
  hasLeadingTrailingWhitespace,
  looksLikeNumber,
  looksLikeIdColumn,
  hasSequentialPattern,
  hasMixedCase,
  getMixedCaseVariants,
  looksLikeDate,
  detectDateFormats,
  looksLikeTimestamp,
  hasConsistentDelimiter,
  levenshteinDistance,
  findTypos,
  findPlaceholders,
  detectOutliers,
} from './detection';
export type { TypoMatch, OutlierResult } from './detection';

// Opportunity detection
export {
  detectAggregationOpportunities,
  detectTimeSeriesOpportunities,
  detectComparisonOpportunities,
} from './opportunities';
export type {
  AggregationOpportunity,
  TimeSeriesOpportunity,
  ComparisonOpportunity,
} from './opportunities';

// Import rules to ensure they're registered
import './rules';
