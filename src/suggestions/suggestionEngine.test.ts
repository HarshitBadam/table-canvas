/**
 * Unit tests for Suggestion Engine
 * Tests cleaning detection logic including:
 * - Mixed case detection
 * - Placeholder detection
 * - Full suggestion generation
 */

import { describe, it, expect } from 'vitest'
import { 
  __testing, 
  generateSuggestions,
  SuggestionEngineContext 
} from './suggestionEngine'
import type { ColumnSchema, ColumnProfile, TableSchema } from '@/types'

const {
  hasMixedCase,
  findPlaceholders,
  getMixedCaseVariants,
  looksLikeIdColumn,
  hasSequentialPattern,
  hasLeadingTrailingWhitespace,
  PLACEHOLDER_VALUES,
} = __testing

// ============================================================================
// Helper Function Tests
// ============================================================================

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

// ============================================================================
// Integration Tests - Full Suggestion Generation
// ============================================================================

describe('generateSuggestions - Cleaning', () => {
  const createContext = (
    columns: ColumnSchema[],
    columnProfiles: ColumnProfile[],
    rowCount = 20
  ): SuggestionEngineContext => ({
    tableId: 'test-table',
    tableName: 'test_table',
    schema: { columns } as TableSchema,
    profile: { columns: columnProfiles, rowCount },
  })

  it('generates whitespace trimming suggestion', () => {
    const columns: ColumnSchema[] = [
      { id: 'name', name: 'name', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'name',
        topValues: [
          { value: 'Laptop Pro ', count: 3 },
          { value: ' Mouse', count: 2 },
          { value: 'Keyboard', count: 5 },
        ],
        distinctCount: 10,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const whitespaceSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'trim'
    )
    expect(whitespaceSuggestion).toBeDefined()
    expect(whitespaceSuggestion?.title).toContain('whitespace')
  })

  it('generates case normalization suggestion for mixed case column', () => {
    const columns: ColumnSchema[] = [
      { id: 'category', name: 'category', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'category',
        topValues: [
          { value: 'Electronics', count: 5 },
          { value: 'electronics', count: 3 },
          { value: 'ELECTRONICS', count: 4 },
        ],
        distinctCount: 3,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const caseSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case'
    )
    expect(caseSuggestion).toBeDefined()
    expect(caseSuggestion?.title).toContain('casing')
  })

  it('generates placeholder conversion suggestion', () => {
    const columns: ColumnSchema[] = [
      { id: 'notes', name: 'notes', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'notes',
        topValues: [
          { value: 'Good product', count: 5 },
          { value: 'N/A', count: 3 },
          { value: 'TBD', count: 2 },
          { value: 'null', count: 1 },
        ],
        distinctCount: 10,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const placeholderSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'nullify_placeholders'
    )
    expect(placeholderSuggestion).toBeDefined()
    expect(placeholderSuggestion?.title).toContain('placeholder')
  })

  it('does NOT generate case normalization for ID-like columns', () => {
    const columns: ColumnSchema[] = [
      { id: 'product_id', name: 'product_id', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'product_id',
        topValues: [
          { value: 'PROD001', count: 1 },
          { value: 'prod002', count: 1 },
          { value: 'Prod003', count: 1 },
        ],
        distinctCount: 20,
        isKeyCandidate: true,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)

    const caseSuggestion = suggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case' &&
           s.context.columnId === 'product_id'
    )
    expect(caseSuggestion).toBeUndefined()
  })

  it('generates multiple cleaning suggestions for messy data', () => {
    const columns: ColumnSchema[] = [
      { id: 'product_name', name: 'product_name', type: 'string', nullable: true },
      { id: 'category', name: 'category', type: 'string', nullable: true },
      { id: 'status', name: 'status', type: 'string', nullable: true },
      { id: 'notes', name: 'notes', type: 'string', nullable: true },
    ]
    const profiles: ColumnProfile[] = [
      {
        columnId: 'product_name',
        topValues: [
          { value: 'Laptop Pro ', count: 1 },
          { value: ' Wireless Mouse', count: 1 },
        ],
        distinctCount: 20,
      } as ColumnProfile,
      {
        columnId: 'category',
        topValues: [
          { value: 'Electronics', count: 5 },
          { value: 'electronics', count: 5 },
          { value: 'ELECTRONICS', count: 5 },
        ],
        distinctCount: 3,
      } as ColumnProfile,
      {
        columnId: 'status',
        topValues: [
          { value: 'Active', count: 8 },
          { value: 'active', count: 5 },
          { value: 'ACTIVE', count: 3 },
          { value: 'inactive', count: 2 },
        ],
        distinctCount: 4,
      } as ColumnProfile,
      {
        columnId: 'notes',
        topValues: [
          { value: 'Good', count: 5 },
          { value: 'N/A', count: 3 },
          { value: 'TBD', count: 2 },
          { value: 'null', count: 2 },
          { value: 'unknown', count: 1 },
        ],
        distinctCount: 10,
      } as ColumnProfile,
    ]

    const context = createContext(columns, profiles)
    const suggestions = generateSuggestions(context)
    const cleaningSuggestions = suggestions.filter(s => s.category === 'cleaning')

    // Log all cleaning suggestions for debugging
    console.log('Cleaning suggestions found:', cleaningSuggestions.map(s => ({
      title: s.title,
      type: s.context.cleaningOperation?.type,
      columnId: s.context.columnId,
    })))

    // Should have at least:
    // 1. Whitespace trimming for product_name
    // 2. Case normalization for category
    // 3. Case normalization for status
    // 4. Placeholder conversion for notes
    expect(cleaningSuggestions.length).toBeGreaterThanOrEqual(4)

    // Verify specific suggestions exist
    const trimSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'trim'
    )
    expect(trimSuggestion).toBeDefined()

    const categoryCaseSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case' &&
           s.context.columnId === 'category'
    )
    expect(categoryCaseSuggestion).toBeDefined()

    const statusCaseSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'normalize_case' &&
           s.context.columnId === 'status'
    )
    expect(statusCaseSuggestion).toBeDefined()

    const placeholderSuggestion = cleaningSuggestions.find(
      s => s.context.cleaningOperation?.type === 'nullify_placeholders'
    )
    expect(placeholderSuggestion).toBeDefined()
  })
})

// ============================================================================
// Column Classification Tests
// ============================================================================

const {
  classifyColumn,
  isUniqueIdentifier,
  classifyNumericColumn,
  classifyStringColumn,
} = __testing

describe('classifyColumn', () => {
  it('classifies sequential numeric ID as unique_identifier', () => {
    const col: ColumnSchema = { id: 'id', name: 'id', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'id', 
      distinctCount: 100, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1, 
      max: 100,
      stdDev: 28.87, // ≈ sqrt((100-1)^2/12) for uniform 1-100
      isKeyCandidate: true 
    }
    expect(classifyColumn(col, profile, 100)).toBe('unique_identifier')
  })

  it('classifies column named "user_id" as unique_identifier', () => {
    const col: ColumnSchema = { id: 'uid', name: 'user_id', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'uid', 
      distinctCount: 50, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('unique_identifier')
  })

  it('classifies height data as continuous_numeric', () => {
    const col: ColumnSchema = { id: 'height', name: 'height', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'height', 
      distinctCount: 45, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 150, 
      max: 200,
      stdDev: 12.5,
      mean: 172 
    }
    expect(classifyColumn(col, profile, 100)).toBe('continuous_numeric')
  })

  it('classifies price data as continuous_numeric', () => {
    const col: ColumnSchema = { id: 'price', name: 'price', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'price', 
      distinctCount: 80, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 9.99, 
      max: 999.99,
      stdDev: 150.5,
      mean: 250 
    }
    expect(classifyColumn(col, profile, 100)).toBe('continuous_numeric')
  })

  it('classifies city as high_cardinality_cat', () => {
    const col: ColumnSchema = { id: 'city', name: 'city', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'city', 
      distinctCount: 50,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'New York', count: 15 },
        { value: 'Los Angeles', count: 12 },
        { value: 'Chicago', count: 10 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('high_cardinality_cat')
  })

  it('classifies status as low_cardinality_cat', () => {
    const col: ColumnSchema = { id: 'status', name: 'status', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'status', 
      distinctCount: 3,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'Active', count: 60 },
        { value: 'Pending', count: 30 },
        { value: 'Inactive', count: 10 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('low_cardinality_cat')
  })

  it('classifies category column as low_cardinality_cat', () => {
    const col: ColumnSchema = { id: 'cat', name: 'category', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'cat', 
      distinctCount: 5,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'Electronics', count: 30 },
        { value: 'Clothing', count: 25 },
        { value: 'Food', count: 20 },
        { value: 'Books', count: 15 },
        { value: 'Other', count: 10 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('low_cardinality_cat')
  })

  it('classifies rating (1-5) as discrete_numeric', () => {
    const col: ColumnSchema = { id: 'rating', name: 'rating', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'rating', 
      distinctCount: 5, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1, 
      max: 5,
      stdDev: 1.2,
      mean: 3.5
    }
    expect(classifyColumn(col, profile, 100)).toBe('discrete_numeric')
  })

  it('classifies quantity counts as discrete_numeric', () => {
    const col: ColumnSchema = { id: 'qty', name: 'quantity', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'qty', 
      distinctCount: 8, 
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1, 
      max: 10,
      stdDev: 2.5
    }
    expect(classifyColumn(col, profile, 100)).toBe('discrete_numeric')
  })

  it('classifies date column as temporal', () => {
    const col: ColumnSchema = { id: 'created', name: 'created_at', type: 'date', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'created', 
      distinctCount: 90,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('temporal')
  })

  it('classifies datetime column as temporal', () => {
    const col: ColumnSchema = { id: 'updated', name: 'updated_at', type: 'datetime', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'updated', 
      distinctCount: 100,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('temporal')
  })

  it('classifies high-uniqueness string (names) as text', () => {
    const col: ColumnSchema = { id: 'name', name: 'customer_name', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'name', 
      distinctCount: 98, // 98% unique
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      topValues: [
        { value: 'John Smith', count: 2 },
        { value: 'Jane Doe', count: 1 },
      ]
    }
    expect(classifyColumn(col, profile, 100)).toBe('text')
  })

  it('classifies column with semantic id hint as unique_identifier', () => {
    const col: ColumnSchema = { 
      id: 'code', 
      name: 'product_code', 
      type: 'string', 
      nullable: false,
      semanticHints: ['id']
    }
    const profile: ColumnProfile = { 
      columnId: 'code', 
      distinctCount: 50,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyColumn(col, profile, 100)).toBe('unique_identifier')
  })
})

describe('isUniqueIdentifier', () => {
  it('returns true for column with isKeyCandidate flag', () => {
    const col: ColumnSchema = { id: 'pk', name: 'record_num', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'pk',
      distinctCount: 100,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      isKeyCandidate: true
    }
    expect(isUniqueIdentifier(col, profile, 100)).toBe(true)
  })

  it('returns false for regular numeric column', () => {
    const col: ColumnSchema = { id: 'price', name: 'price', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'price',
      distinctCount: 50,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 10,
      max: 500,
      stdDev: 100,
      isKeyCandidate: false
    }
    expect(isUniqueIdentifier(col, profile, 100)).toBe(false)
  })

  it('returns true for auto-increment like numeric (1 to N)', () => {
    const col: ColumnSchema = { id: 'idx', name: 'row_index', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'idx',
      distinctCount: 100,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1,
      max: 100,
      stdDev: 28.87 // uniform distribution stdDev
    }
    expect(isUniqueIdentifier(col, profile, 100)).toBe(true)
  })
})

describe('classifyNumericColumn', () => {
  it('returns discrete_numeric for small distinct count', () => {
    const col: ColumnSchema = { id: 'stars', name: 'stars', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'stars',
      distinctCount: 5, // Only 5 distinct values
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1,
      max: 5
    }
    expect(classifyNumericColumn(col, profile, 100)).toBe('discrete_numeric')
  })

  it('returns continuous_numeric for high distinct count', () => {
    const col: ColumnSchema = { id: 'revenue', name: 'revenue', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'revenue',
      distinctCount: 85,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 1000,
      max: 100000,
      stdDev: 25000
    }
    expect(classifyNumericColumn(col, profile, 100)).toBe('continuous_numeric')
  })

  it('returns discrete_numeric for zero variance', () => {
    const col: ColumnSchema = { id: 'const', name: 'constant', type: 'number', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'const',
      distinctCount: 1,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100,
      min: 42,
      max: 42,
      stdDev: 0
    }
    expect(classifyNumericColumn(col, profile, 100)).toBe('discrete_numeric')
  })
})

describe('classifyStringColumn', () => {
  it('returns low_cardinality_cat for few distinct values', () => {
    const col: ColumnSchema = { id: 'status', name: 'status', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'status',
      distinctCount: 4,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyStringColumn(col, profile, 100)).toBe('low_cardinality_cat')
  })

  it('returns high_cardinality_cat for medium distinct values', () => {
    const col: ColumnSchema = { id: 'city', name: 'city', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'city',
      distinctCount: 40,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyStringColumn(col, profile, 100)).toBe('high_cardinality_cat')
  })

  it('returns text for near-unique values', () => {
    const col: ColumnSchema = { id: 'desc', name: 'description', type: 'string', nullable: false }
    const profile: ColumnProfile = { 
      columnId: 'desc',
      distinctCount: 97,
      missingCount: 0,
      missingPercent: 0,
      completeness: 100
    }
    expect(classifyStringColumn(col, profile, 100)).toBe('text')
  })
})

describe('analysis suggestions use classification', () => {
  const createContext = (
    columns: ColumnSchema[],
    columnProfiles: ColumnProfile[],
    rowCount = 100
  ): SuggestionEngineContext => ({
    tableId: 'test-table',
    tableName: 'test_table',
    schema: { columns } as TableSchema,
    profile: { columns: columnProfiles, rowCount },
  })

  it('does NOT suggest histogram for ID column', () => {
    const columns: ColumnSchema[] = [
      { id: 'id', name: 'id', type: 'number', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'id', 
        distinctCount: 100, 
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        isKeyCandidate: true, 
        min: 1, 
        max: 100,
        stdDev: 28.87
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    const histogram = suggestions.find(s => s.title.includes('Distribution of id'))
    expect(histogram).toBeUndefined()
  })

  it('suggests histogram for continuous numeric column', () => {
    const columns: ColumnSchema[] = [
      { id: 'height', name: 'height', type: 'number', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'height', 
        distinctCount: 45, 
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        min: 150, 
        max: 200, 
        stdDev: 12.5 
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    const histogram = suggestions.find(s => s.title.includes('Distribution of height'))
    expect(histogram).toBeDefined()
  })

  it('suggests category breakdown for low cardinality categorical + numeric', () => {
    const columns: ColumnSchema[] = [
      { id: 'status', name: 'status', type: 'string', nullable: false },
      { id: 'amount', name: 'amount', type: 'number', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'status', 
        distinctCount: 3,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        topValues: [
          { value: 'Active', count: 50 },
          { value: 'Pending', count: 30 },
          { value: 'Inactive', count: 20 },
        ]
      },
      { 
        columnId: 'amount', 
        distinctCount: 80,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        min: 100, 
        max: 10000, 
        stdDev: 2500 
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    const breakdown = suggestions.find(s => 
      s.title.includes('amount') && s.title.includes('status')
    )
    expect(breakdown).toBeDefined()
  })

  it('does NOT suggest chart for ID + unique text columns only', () => {
    const columns: ColumnSchema[] = [
      { id: 'id', name: 'id', type: 'number', nullable: false },
      { id: 'name', name: 'customer_name', type: 'string', nullable: false },
    ]
    const profiles: ColumnProfile[] = [
      { 
        columnId: 'id', 
        distinctCount: 100,
        missingCount: 0,
        missingPercent: 0,
        completeness: 100,
        isKeyCandidate: true,
        min: 1, 
        max: 100,
        stdDev: 28.87
      },
      { 
        columnId: 'name', 
        distinctCount: 98, // Near-unique
        missingCount: 0,
        missingPercent: 0,
        completeness: 100
      },
    ]

    const context = createContext(columns, profiles, 100)
    const suggestions = generateSuggestions(context)
    
    // Should not have any analysis suggestions since both columns are unsuitable
    const analysisSuggestions = suggestions.filter(s => s.category === 'analysis')
    expect(analysisSuggestions.length).toBe(0)
  })
})
