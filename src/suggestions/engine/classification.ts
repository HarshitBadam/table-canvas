import type { ColumnSchema, ColumnProfile, ColumnClassification } from '@/types';
import { hasSequentialPattern } from './detection';


export function classifyColumn(
  col: ColumnSchema, 
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (isUniqueIdentifier(col, profile, rowCount)) {
    return 'unique_identifier';
  }
  
  if (col.type === 'date' || col.type === 'datetime') {
    return 'temporal';
  }
  
  if (col.type === 'number') {
    return classifyNumericColumn(col, profile, rowCount);
  }

  if (col.type === 'boolean') {
    return 'boolean';
  }
  
  if (col.type === 'string') {
    return classifyStringColumn(col, profile, rowCount);
  }
  
  return 'text';
}


/**
 * Check if a column is a unique identifier (should not be analyzed/charted)
 */
export function isUniqueIdentifier(
  col: ColumnSchema, 
  profile: ColumnProfile | undefined,
  rowCount: number
): boolean {
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
  
  if (col.semanticHints?.includes('id')) return true;
  
  if (profile) {
    const uniquenessRatio = profile.distinctCount / Math.max(rowCount, 1);
    if (uniquenessRatio > 0.95) {
      if (col.type === 'number' && profile.min !== undefined && profile.max !== undefined) {
        // Check if min starts at 0 or 1 and max = rowCount (classic auto-increment)
        if ((profile.min === 0 || profile.min === 1) && 
            Math.abs(profile.max - (profile.min + rowCount - 1)) <= rowCount * 0.1) {
          return true;
        }
      }
      
      if ((hasIdName || endsWithId) && col.type === 'string') return true;
      
      if (col.type === 'string' && profile.topValues && profile.topValues.length >= 3) {
        if (hasSequentialPattern(profile.topValues.map(v => String(v.value)))) {
          return true;
        }
      }
    }
  }
  
  if (hasIdName && name.length <= 12) return true;
  if (endsWithId) return true;
  
  return false;
}


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
    if (range <= 20 && profile.distinctCount <= range + 1) {
      return 'discrete_numeric';
    }
  }
  
  return 'continuous_numeric';
}


export function classifyStringColumn(
  col: ColumnSchema,
  profile: ColumnProfile | undefined,
  rowCount: number
): ColumnClassification {
  if (!profile) return 'low_cardinality_cat'; // Conservative default
  
  const distinctRatio = profile.distinctCount / Math.max(rowCount, 1);

  if (profile.distinctCount < 2) {
    return 'text';
  }
  
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


/**
 * Check if a numeric column is meaningful for analysis (not an ID, has variance)
 */
export function isAnalyzableNumeric(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'number') return false;
  if (!profile) return true; // Assume analyzable without profile
  
  if (isUniqueIdentifier(col, profile, Math.max(profile.distinctCount, 1))) return false;
  if (col.semanticHints?.includes('id')) return false;
  if (profile.distinctCount < 1 || profile.completeness <= 0) return false;
  
  if (profile.stdDev !== undefined && profile.stdDev === 0) return false;
  
  return true;
}

/**
 * Check if a string column is good for grouping (categorical with reasonable cardinality)
 */
export function isGroupableCategory(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.type !== 'string') return false;
  if (!profile) return true; // Assume groupable without profile
  
  if (profile.isKeyCandidate) return false;
  if (col.semanticHints?.includes('id')) return false;
  
  // Must have reasonable cardinality (not too high)
  const distinctCount = profile.distinctCount ?? 0;
  if (distinctCount > 100) return false;
  if (distinctCount < 2) return false;
  
  return true;
}
