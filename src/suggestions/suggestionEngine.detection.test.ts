import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_VALUES } from './cleaningConstants'
import {
  findPlaceholders,
  getMixedCaseVariants,
  hasLeadingTrailingWhitespace,
  hasMixedCase,
  hasSequentialPattern,
  looksLikeIdColumn,
} from './engine/detection'
import type { ColumnProfile, ColumnSchema } from '@/types'

describe('hasLeadingTrailingWhitespace', () => {
  it('detects leading whitespace', () => {
    expect(hasLeadingTrailingWhitespace(' hello')).toBe(true)
    expect(hasLeadingTrailingWhitespace('  test')).toBe(true)
  })

  it('detects trailing whitespace', () => {
    expect(hasLeadingTrailingWhitespace('hello ')).toBe(true)
    expect(hasLeadingTrailingWhitespace('test  ')).toBe(true)
  })

  it('detects both leading and trailing', () => {
    expect(hasLeadingTrailingWhitespace(' hello ')).toBe(true)
    expect(hasLeadingTrailingWhitespace('  test  ')).toBe(true)
  })

  it('returns false for clean strings', () => {
    expect(hasLeadingTrailingWhitespace('hello')).toBe(false)
    expect(hasLeadingTrailingWhitespace('test')).toBe(false)
  })

  it('handles null and undefined', () => {
    expect(hasLeadingTrailingWhitespace(null)).toBe(false)
    expect(hasLeadingTrailingWhitespace(undefined)).toBe(false)
  })
})

describe('hasMixedCase', () => {
  it('detects mixed case variants of same value', () => {
    const topValues = [
      { value: 'Electronics', count: 5 },
      { value: 'electronics', count: 3 },
      { value: 'ELECTRONICS', count: 4 },
    ]
    expect(hasMixedCase(topValues)).toBe(true)
  })

  it('detects two case variants', () => {
    const topValues = [
      { value: 'Active', count: 10 },
      { value: 'active', count: 8 },
    ]
    expect(hasMixedCase(topValues)).toBe(true)
  })

  it('returns false when all same case', () => {
    const topValues = [
      { value: 'Electronics', count: 5 },
      { value: 'Furniture', count: 3 },
      { value: 'Clothing', count: 4 },
    ]
    expect(hasMixedCase(topValues)).toBe(false)
  })

  it('returns false for completely different values', () => {
    const topValues = [
      { value: 'apple', count: 5 },
      { value: 'BANANA', count: 3 },
      { value: 'Cherry', count: 4 },
    ]
    expect(hasMixedCase(topValues)).toBe(false)
  })

  it('handles empty array', () => {
    expect(hasMixedCase([])).toBe(false)
  })

  it('handles single value', () => {
    expect(hasMixedCase([{ value: 'Test', count: 1 }])).toBe(false)
  })

  it('handles null values in array', () => {
    const topValues = [
      { value: null, count: 5 },
      { value: 'Test', count: 3 },
      { value: 'test', count: 2 },
    ]
    expect(hasMixedCase(topValues)).toBe(true)
  })
})

describe('findPlaceholders', () => {
  it('detects N/A placeholder', () => {
    const topValues = [
      { value: 'N/A', count: 3 },
      { value: 'Good product', count: 5 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toContain('N/A')
    expect(result.totalCount).toBe(3)
  })

  it('detects null placeholder', () => {
    const topValues = [
      { value: 'null', count: 2 },
      { value: 'Great', count: 5 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toContain('null')
    expect(result.totalCount).toBe(2)
  })

  it('detects TBD placeholder', () => {
    const topValues = [
      { value: 'TBD', count: 4 },
      { value: 'Complete', count: 6 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toContain('TBD')
    expect(result.totalCount).toBe(4)
  })

  it('detects unknown placeholder', () => {
    const topValues = [
      { value: 'unknown', count: 3 },
      { value: 'Known value', count: 7 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toContain('unknown')
  })

  it('detects multiple placeholders', () => {
    const topValues = [
      { value: 'N/A', count: 3 },
      { value: 'TBD', count: 2 },
      { value: 'null', count: 1 },
      { value: 'Good', count: 10 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toHaveLength(3)
    expect(result.totalCount).toBe(6)
  })

  it('is case insensitive', () => {
    const topValues = [
      { value: 'N/A', count: 1 },
      { value: 'n/a', count: 1 },
      { value: 'NULL', count: 1 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toHaveLength(3)
  })

  it('returns empty for clean data', () => {
    const topValues = [
      { value: 'Good', count: 5 },
      { value: 'Great', count: 3 },
      { value: 'Excellent', count: 2 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('handles null values in array', () => {
    const topValues = [
      { value: null, count: 5 },
      { value: 'N/A', count: 3 },
    ]
    const result = findPlaceholders(topValues)
    expect(result.placeholders).toContain('N/A')
    expect(result.placeholders).toHaveLength(1) // null is skipped, not a placeholder
  })
})

describe('getMixedCaseVariants', () => {
  it('creates mappings for case variants', () => {
    const topValues = [
      { value: 'Electronics', count: 10 },
      { value: 'electronics', count: 5 },
      { value: 'ELECTRONICS', count: 3 },
    ]
    const mappings = getMixedCaseVariants(topValues)
    
    // Most common (Electronics) should be canonical
    expect(mappings['electronics']).toBe('Electronics')
    expect(mappings['ELECTRONICS']).toBe('Electronics')
    expect(mappings['Electronics']).toBeUndefined() // canonical not in mappings
  })

  it('handles multiple groups of variants', () => {
    const topValues = [
      { value: 'Active', count: 10 },
      { value: 'active', count: 5 },
      { value: 'Inactive', count: 8 },
      { value: 'inactive', count: 3 },
    ]
    const mappings = getMixedCaseVariants(topValues)
    
    expect(mappings['active']).toBe('Active')
    expect(mappings['inactive']).toBe('Inactive')
  })

  it('returns empty for no variants', () => {
    const topValues = [
      { value: 'Apple', count: 5 },
      { value: 'Banana', count: 3 },
    ]
    const mappings = getMixedCaseVariants(topValues)
    expect(Object.keys(mappings)).toHaveLength(0)
  })
})

describe('looksLikeIdColumn', () => {
  it('detects column with "id" semantic hint', () => {
    const col: ColumnSchema = { id: 'col1', name: 'user', type: 'string', nullable: true, semanticHints: ['id'] }
    expect(looksLikeIdColumn(col)).toBe(true)
  })

  it('detects column name ending with _id', () => {
    const col: ColumnSchema = { id: 'col1', name: 'user_id', type: 'string', nullable: true }
    expect(looksLikeIdColumn(col)).toBe(true)
  })

  it('detects column name ending with id', () => {
    const col: ColumnSchema = { id: 'col1', name: 'userid', type: 'string', nullable: true }
    expect(looksLikeIdColumn(col)).toBe(true)
  })

  it('detects column named "id"', () => {
    const col: ColumnSchema = { id: 'col1', name: 'id', type: 'string', nullable: true }
    expect(looksLikeIdColumn(col)).toBe(true)
  })

  it('detects key candidate from profile', () => {
    const col: ColumnSchema = { id: 'col1', name: 'code', type: 'string', nullable: true }
    const profile: ColumnProfile = { columnId: 'col1', isKeyCandidate: true } as ColumnProfile
    expect(looksLikeIdColumn(col, profile)).toBe(true)
  })

  it('does not flag regular columns', () => {
    const col: ColumnSchema = { id: 'col1', name: 'category', type: 'string', nullable: true }
    expect(looksLikeIdColumn(col)).toBe(false)
  })

  it('does not flag status columns', () => {
    const col: ColumnSchema = { id: 'col1', name: 'status', type: 'string', nullable: true }
    expect(looksLikeIdColumn(col)).toBe(false)
  })
})

describe('hasSequentialPattern', () => {
  it('detects sequential numeric suffixes', () => {
    const values = ['PROD001', 'PROD002', 'PROD003', 'PROD004']
    expect(hasSequentialPattern(values)).toBe(true)
  })

  it('detects roughly sequential values', () => {
    const values = ['SKU100', 'SKU101', 'SKU103', 'SKU105']
    expect(hasSequentialPattern(values)).toBe(true)
  })

  it('returns false for non-sequential', () => {
    const values = ['PROD001', 'PROD050', 'PROD200', 'PROD500']
    expect(hasSequentialPattern(values)).toBe(false)
  })

  it('returns false for non-numeric values', () => {
    const values = ['apple', 'banana', 'cherry']
    expect(hasSequentialPattern(values)).toBe(false)
  })

  it('returns false for too few values', () => {
    const values = ['PROD001', 'PROD002']
    expect(hasSequentialPattern(values)).toBe(false)
  })
})

describe('PLACEHOLDER_VALUES', () => {
  it('contains common placeholder values', () => {
    expect(PLACEHOLDER_VALUES).toContain('n/a')
    expect(PLACEHOLDER_VALUES).toContain('null')
    expect(PLACEHOLDER_VALUES).toContain('unknown')
    expect(PLACEHOLDER_VALUES).toContain('tbd')
    expect(PLACEHOLDER_VALUES).toContain('missing')
    expect(PLACEHOLDER_VALUES).toContain('none')
  })
})


