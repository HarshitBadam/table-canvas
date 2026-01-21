/**
 * Suggestion Engine
 * 
 * This file re-exports from the modular engine structure for backward compatibility.
 * The actual implementation has been split into:
 * - engine/core.ts - Main generation functions
 * - engine/registry.ts - Rule registry
 * - engine/detection.ts - Pattern detection utilities
 * - engine/classification.ts - Column classification
 * - engine/opportunities.ts - Analysis opportunity detection
 * - engine/rules/*.ts - Individual rule modules
 */

// Re-export everything from the modular engine
export { 
  generateSuggestions, 
  getColumnSuggestions,
  // Registry
  registerRule,
  getRules,
  getTableRules,
  getColumnRules,
  createSuggestionId,
  getVersionHash,
  // Classification
  classifyColumn,
  isUniqueIdentifier,
  classifyNumericColumn,
  classifyStringColumn,
  isAnalyzableNumeric,
  isGroupableCategory,
  looksLikeCategoryByName,
  // Detection
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
  // Opportunities
  detectAggregationOpportunities,
  detectTimeSeriesOpportunities,
  detectComparisonOpportunities,
} from './engine';

// Re-export types
export type { 
  SuggestionEngineContext,
  MetadataBundle,
  SuggestionRule,
  TypoMatch,
  OutlierResult,
  AggregationOpportunity,
  TimeSeriesOpportunity,
  ComparisonOpportunity,
} from './engine';

// Import from engine for __testing export
import {
  hasMixedCase,
  findPlaceholders,
  getMixedCaseVariants,
  looksLikeIdColumn,
  hasSequentialPattern,
  hasLeadingTrailingWhitespace,
  classifyColumn,
  isUniqueIdentifier,
  classifyNumericColumn,
  classifyStringColumn,
} from './engine';

import { PLACEHOLDER_VALUES } from './cleaningConstants';

// ============================================================================
// Exports for testing
// ============================================================================

export const __testing = {
  hasMixedCase,
  findPlaceholders,
  getMixedCaseVariants,
  looksLikeIdColumn,
  hasSequentialPattern,
  hasLeadingTrailingWhitespace,
  PLACEHOLDER_VALUES,
  // Column classification functions
  classifyColumn,
  isUniqueIdentifier,
  classifyNumericColumn,
  classifyStringColumn,
};
