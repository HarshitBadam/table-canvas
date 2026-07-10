import { ColumnSchema, ColumnProfile } from '@/types';
import { isPlaceholder } from '../cleaningConstants';
import { EPOCH_MS_MIN, EPOCH_MS_MAX } from '@/charts/chartShared';


export function hasLeadingTrailingWhitespace(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const str = String(value);
  return str !== str.trim();
}


export function looksLikeNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const str = String(value).replace(/[,$%\s]/g, '');
  return !isNaN(Number(str)) && str.length > 0;
}


export function looksLikeIdColumn(col: ColumnSchema, profile?: ColumnProfile): boolean {
  if (col.semanticHints?.includes('id')) return true;
  
  if (profile?.isKeyCandidate) return true;
  
  const name = col.name.toLowerCase();
  if (name.endsWith('_id') || name.endsWith('id') || 
      name === 'id' || name.includes('code') || 
      name.includes('sku') || name.includes('product_id') ||
      name.includes('order_id') || name.includes('user_id') ||
      name.includes('customer_id') || name.includes('item_id')) return true;
  
  if (profile?.topValues && profile.topValues.length >= 3) {
    const values = profile.topValues.map(v => String(v.value));
    if (hasSequentialPattern(values)) return true;
  }
  
  return false;
}

export function hasSequentialPattern(values: string[]): boolean {
  const numericSuffixes = values.map(v => {
    const match = v.match(/(\d+)$/);
    return match ? parseInt(match[1]) : null;
  }).filter((n): n is number => n !== null);
  
  if (numericSuffixes.length < 3) return false;
  
  const sorted = [...numericSuffixes].sort((a, b) => a - b);
  let sequential = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i-1] <= 3) sequential++;
  }
  return sequential >= (sorted.length - 1) * 0.7;
}


export function hasMixedCase(values: Array<{ value: unknown; count?: number }>): boolean {
  const strings = values
    .map(v => String(v.value).trim())
    .filter(s => s && s.length > 0);
  
  const normalizedValues = new Map<string, Set<string>>();
  for (const s of strings) {
    const lower = s.toLowerCase();
    if (!normalizedValues.has(lower)) {
      normalizedValues.set(lower, new Set());
    }
    normalizedValues.get(lower)!.add(s);
  }
  
  return Array.from(normalizedValues.values()).some(variants => variants.size > 1);
}

export function getMixedCaseVariants(values: Array<{ value: unknown; count: number }>): Record<string, string> {
  const normalizedValues = new Map<string, Array<{ value: string; count: number }>>();
  
  for (const v of values) {
    if (v.value === null || v.value === undefined) continue;
    const str = String(v.value).trim();
    if (!str) continue;
    
    const lower = str.toLowerCase();
    if (!normalizedValues.has(lower)) {
      normalizedValues.set(lower, []);
    }
    normalizedValues.get(lower)!.push({ value: str, count: v.count });
  }
  
  const mappings: Record<string, string> = {};
  
  for (const [, variants] of normalizedValues) {
    if (variants.length > 1) {
      variants.sort((a, b) => b.count - a.count);
      const canonical = variants[0].value;
      for (let i = 1; i < variants.length; i++) {
        mappings[variants[i].value] = canonical;
      }
    }
  }
  
  return mappings;
}


export function detectDateFormats(topValues: Array<{ value: unknown }>): Set<string> {
  const formats = new Set<string>();
  
  for (const { value } of topValues) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (!str) continue;
    
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
      formats.add('YYYY-MM-DD');
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
      formats.add('MM/DD/YYYY');
    } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) {
      formats.add('MM/DD/YY');
    } else if (/^\d{1,2}-[A-Za-z]{3}-\d{4}/.test(str)) {
      formats.add('DD-Mon-YYYY');
    } else if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(str)) {
      formats.add('Mon DD, YYYY');
    } else if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(str)) {
      formats.add('DD Mon YYYY');
    }
  }
  
  return formats;
}


export function looksLikeTimestamp(min: number | undefined, max: number | undefined): 'milliseconds' | 'seconds' | null {
  if (min === undefined || max === undefined) return null;
  
  const epochSecMin = EPOCH_MS_MIN / 1000;
  const epochSecMax = EPOCH_MS_MAX / 1000;
  
  if (min > EPOCH_MS_MIN && max < EPOCH_MS_MAX) {
    return 'milliseconds';
  }
  if (min > epochSecMin && max < epochSecMax && max < EPOCH_MS_MIN) {
    return 'seconds';
  }
  
  return null;
}


export function hasConsistentDelimiter(values: Array<{ value: unknown }>): string | null {
  const delimiters = [',', '|', ';', '-', '_'];
  
  for (const delim of delimiters) {
    const counts = values
      .map(v => (String(v.value).match(new RegExp(`\\${delim}`, 'g')) || []).length)
      .filter(c => c > 0);
    
    if (counts.length >= values.length * 0.7 && counts.every(c => c === counts[0])) {
      return delim;
    }
  }
  
  return null;
}


function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i-1] === a[j-1]
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

export interface TypoMatch {
  from: string;
  to: string;
  fromCount: number;
  toCount: number;
}

export function findTypos(topValues: Array<{ value: unknown; count: number }>): TypoMatch[] {
  const results: TypoMatch[] = [];
  const strings = topValues
    .filter(v => v.value !== null && v.value !== undefined)
    .map(v => ({ str: String(v.value), count: v.count }));
  
  for (let i = 0; i < strings.length; i++) {
    for (let j = i + 1; j < strings.length; j++) {
      const a = strings[i].str.toLowerCase();
      const b = strings[j].str.toLowerCase();
      
      if (Math.abs(a.length - b.length) > 2) continue;
      if (a.length < 3 || b.length < 3) continue;
      
      const distance = levenshteinDistance(a, b);
      const threshold = Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.25));
      
      if (distance > 0 && distance <= threshold) {
        if (strings[i].count >= strings[j].count) {
          results.push({
            from: strings[j].str,
            to: strings[i].str,
            fromCount: strings[j].count,
            toCount: strings[i].count,
          });
        } else {
          results.push({
            from: strings[i].str,
            to: strings[j].str,
            fromCount: strings[i].count,
            toCount: strings[j].count,
          });
        }
      }
    }
  }
  return results;
}


export function findPlaceholders(topValues: Array<{ value: unknown; count: number }>): { placeholders: string[]; totalCount: number } {
  const found: string[] = [];
  let totalCount = 0;
  
  for (const { value, count } of topValues) {
    if (isPlaceholder(value)) {
      found.push(String(value));
      totalCount += count;
    }
  }
  
  return { placeholders: found, totalCount };
}


export interface OutlierResult {
  hasOutliers: boolean;
  lowerBound: number;
  upperBound: number;
}

export function detectOutliers(profile: { min?: number; max?: number; q1?: number; q3?: number; iqr?: number }): OutlierResult | null {
  const { min, max, q1, q3, iqr } = profile;
  if (q1 === undefined || q3 === undefined || iqr === undefined || iqr === 0) {
    return null;
  }
  
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  const hasOutliers = (min !== undefined && min < lowerBound) || (max !== undefined && max > upperBound);
  
  return { hasOutliers, lowerBound, upperBound };
}
