/**
 * Column Classification System
 * 
 * Classifies columns for intelligent suggestion generation.
 * Determines what types of analysis/charts make sense for each column.
 */

import type { ColumnSchema, ColumnProfile, ColumnClassification } from '@/lib/types';
import { hasSequentialPattern } from './detection';

// ============================================================================
// Main Classification Function
// ============================================================================

/**
 * Classify a column for intelligent suggestion generation.
 */
export function classifyColumn(
  col: ColumnSchema, 
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  // 1. Check for unique identifiers first (most important to filter out)
  if (isUniqueIdentifier(col, profile, rowCount)) {
    return 'unique_identifier';
  }
  
  // 2. Temporal columns
  if (col.type === 'date' || col.type === 'datetime') {
    return 'temporal';
  }
  
  // 3. Numeric columns
  if (col.type === 'number') {
    return classifyNumericColumn(col, profile, rowCount);
  }
  
  // 4. String columns
  if (col.type === 'string') {
    return classifyStringColumn(col, profile, rowCount);
  }
  
  return 'text';
}

// ============================================================================
// Unique Identifier Detection
// ============================================================================

/**
 * Check if a column is a unique identifier (should not be analyzed/charted)
 */
export function isUniqueIdentifier(
  col: ColumnSchema, 
  profile: ColumnProfile | undefined,
  rowCount: number
): boolean {
  // Name-based detection patterns
  const name = col.name.toLowerCase();
  const idPatterns = [
    /^id$/,           // exactly "id"
    /_id$/,           // ends with _id
    /^uuid$/,         // uuid
    /^guid$/,         // guid
    /_key$/,          // ends with _key
    /^key$/,          // exactly "key"
    /_code$/,         // ends with _code
    /^code$/,         // exactly "code"
    /^sku$/,          // exactly "sku"
    /^serial/,        // starts with "serial"
    /^index$/,        // exactly "index"
    /^row_?num/,      // row number variations
  ];
  const hasIdName = idPatterns.some(p => p.test(name));
  
  // Also check if name ends with "id" and is short (e.g., "userid", "productid")
  const endsWithId = name.endsWith('id') && name.length <= 15 && name.length > 2;
  
  // Semantic hint check
  if (col.semanticHints?.includes('id')) return true;
  
  // Profile-based detection
  if (profile) {
    // Key candidate from profiler (>95% unique, <1% null)
    if (profile.isKeyCandidate) return true;
    
    // Uniqueness ratio > 95% with additional checks
    const uniquenessRatio = profile.distinctCount / Math.max(rowCount, 1);
    if (uniquenessRatio > 0.95) {
      // If numeric, check for sequential pattern
      if (col.type === 'number' && profile.stdDev !== undefined && profile.min !== undefined && profile.max !== undefined) {
        const range = profile.max - profile.min;
        if (range > 0) {
          // For a uniform/sequential distribution, stdDev ≈ range / sqrt(12)
          const expectedStdDev = range / Math.sqrt(12);
          // Allow 50% tolerance for "close to sequential"
          const isSequential = expectedStdDev > 0 && 
            Math.abs((profile.stdDev - expectedStdDev) / expectedStdDev) < 0.5;
          if (isSequential) return true;
        }
        
        // Check if min starts at 0 or 1 and max = rowCount (classic auto-increment)
        if ((profile.min === 0 || profile.min === 1) && 
            Math.abs(profile.max - (profile.min + rowCount - 1)) <= rowCount * 0.1) {
          return true;
        }
      }
      
      // String with high uniqueness AND ID-like name
      if ((hasIdName || endsWithId) && col.type === 'string') return true;
      
      // Check for sequential string pattern (PROD001, PROD002...)
      if (col.type === 'string' && profile.topValues && profile.topValues.length >= 3) {
        if (hasSequentialPattern(profile.topValues.map(v => String(v.value)))) {
          return true;
        }
      }
    }
  }
  
  // Strong name-based signals without profile
  if (hasIdName && name.length <= 12) return true;
  if (endsWithId) return true;
  
  return false;
}

// ============================================================================
// Numeric Column Classification
// ============================================================================

/**
 * Classify a numeric column as continuous or discrete
 */
export function classifyNumericColumn(
  _col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (!profile) return 'continuous_numeric'; // Default assumption
  
  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1);
  
  // Few distinct values = discrete (ratings 1-5, counts, boolean-like, etc.)
  if (profile.distinctCount <= 10 || distinctRatio < 0.05) {
    return 'discrete_numeric';
  }
  
  // Zero variance = all same value, treat as discrete
  if (profile.stdDev !== undefined && profile.stdDev === 0) {
    return 'discrete_numeric';
  }
  
  // Integer values with small range might be discrete
  if (profile.min !== undefined && profile.max !== undefined) {
    const range = profile.max - profile.min;
    // If range is small and all values are likely integers
    if (range <= 20 && profile.distinctCount <= range + 1) {
      return 'discrete_numeric';
    }
  }
  
  return 'continuous_numeric';
}

// ============================================================================
// String Column Classification
// ============================================================================

/**
 * Classify a string column by cardinality
 */
export function classifyStringColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (!profile) return 'low_cardinality_cat'; // Conservative default
  
  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1);
  
  // Check for semantic hints that indicate category
  if (col.semanticHints?.includes('category')) {
    return profile.distinctCount <= 20 ? 'low_cardinality_cat' : 'high_cardinality_cat';
  }
  
  // Very low cardinality = great for pie/bar charts
  if (profile.distinctCount <= 20 && distinctRatio < 0.5) {
    return 'low_cardinality_cat';
  }
  
  // Medium cardinality = can chart but needs Top N treatment
  if (distinctRatio < 0.95 && profile.distinctCount <= 100) {
    return 'high_cardinality_cat';
  }
  
  // High uniqueness strings are likely free-form text (names, descriptions, etc.)
  return 'text';
}

// ============================================================================
// Analysis Helpers
// ============================================================================

/**
 * Check if a numeric column is meaningful for analysis (not an ID, has variance)
 */
export function isAnalyzableNumeric(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'number') return false;
  if (!profile) return true; // Assume analyzable without profile
  
  // Skip if it looks like an ID
  if (profile.isKeyCandidate) return false;
  if (col.semanticHints?.includes('id')) return false;
  
  // Must have some variance
  if (profile.stdDev !== undefined && profile.stdDev === 0) return false;
  
  return true;
}

/**
 * Check if a string column is good for grouping (categorical with reasonable cardinality)
 */
export function isGroupableCategory(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'string') return false;
  if (!profile) return true; // Assume groupable without profile
  
  // Skip if it looks like an ID
  if (profile.isKeyCandidate) return false;
  if (col.semanticHints?.includes('id')) return false;
  
  // Must have reasonable cardinality (not too high)
  const distinctCount = profile.distinctCount ?? 0;
  if (distinctCount > 100) return false; // Too many categories
  if (distinctCount < 2) return false; // Not enough categories
  
  return true;
}

/**
 * Check if column looks like a category based on name
 */
export function looksLikeCategoryByName(columnName: string): boolean {
  const name = columnName.toLowerCase();
  return name.includes('category') || name.includes('type') || name.includes('status') ||
         name.includes('group') || name.includes('class') || name.includes('segment') ||
         name.includes('region') || name.includes('country') || name.includes('state') ||
         name.includes('department') || name.includes('product') || name.includes('brand');
}
