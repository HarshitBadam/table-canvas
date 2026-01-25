/**
 * Unit tests for Grid Filter Utilities
 * 
 * Tests the core filtering logic including:
 * - Condition evaluation for all operators
 * - Type-specific comparisons (string, number, date, boolean)
 * - Multi-select (enum) filtering
 * - Filter application to rows
 * - Edge cases (null, empty, special characters)
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  applyFilters,
  isEnumColumn,
  getEffectiveFilterType,
  getOperatorsForType,
  getOperatorLabel,
  getUniqueValues,
  countUniqueValues,
  createFilterCondition,
  hasActiveFilters,
  countActiveFilters,
  createEmptyFilterConfig,
  quickDateOptions,
} from './filterUtils'
import type { ColumnSchema } from '@/lib/types'

// ============================================================================
// Test Fixtures
// ============================================================================

interface TestRow {
  __rowId: string
  [key: string]: string | number | boolean | null
}

function createRow(id: string, data: Record<string, string | number | boolean | null>): TestRow {
  return { __rowId: id, ...data }
}

// Identity display value function (no patches)
const identityDisplayValue = (_rowId: string, _colId: string, base: unknown) => base

// ============================================================================
// evaluateCondition - String Operations
// ============================================================================

describe('evaluateCondition - String Operations', () => {
  it('evaluates equals (case-insensitive)', () => {
    expect(evaluateCondition('Hello', { columnId: 'col', operator: 'equals', value: 'hello' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello', { columnId: 'col', operator: 'equals', value: 'HELLO' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello', { columnId: 'col', operator: 'equals', value: 'world' }, 'string')).toBe(false)
  })

  it('evaluates not_equals', () => {
    expect(evaluateCondition('Hello', { columnId: 'col', operator: 'not_equals', value: 'World' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello', { columnId: 'col', operator: 'not_equals', value: 'hello' }, 'string')).toBe(false)
  })

  it('evaluates contains', () => {
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'contains', value: 'World' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'contains', value: 'world' }, 'string')).toBe(true) // case-insensitive
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'contains', value: 'foo' }, 'string')).toBe(false)
  })

  it('evaluates not_contains', () => {
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'not_contains', value: 'foo' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'not_contains', value: 'world' }, 'string')).toBe(false)
  })

  it('evaluates starts_with', () => {
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'starts_with', value: 'Hello' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'starts_with', value: 'hello' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'starts_with', value: 'World' }, 'string')).toBe(false)
  })

  it('evaluates ends_with', () => {
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'ends_with', value: 'World' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'ends_with', value: 'world' }, 'string')).toBe(true)
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'ends_with', value: 'Hello' }, 'string')).toBe(false)
  })
})

// ============================================================================
// evaluateCondition - Number Operations
// ============================================================================

describe('evaluateCondition - Number Operations', () => {
  it('evaluates equals for numbers', () => {
    expect(evaluateCondition(100, { columnId: 'col', operator: 'equals', value: '100' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'equals', value: '99' }, 'number')).toBe(false)
  })

  it('evaluates not_equals for numbers', () => {
    expect(evaluateCondition(100, { columnId: 'col', operator: 'not_equals', value: '50' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'not_equals', value: '100' }, 'number')).toBe(false)
  })

  it('evaluates greater_than', () => {
    expect(evaluateCondition(100, { columnId: 'col', operator: 'greater_than', value: '50' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'greater_than', value: '100' }, 'number')).toBe(false)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'greater_than', value: '150' }, 'number')).toBe(false)
  })

  it('evaluates less_than', () => {
    expect(evaluateCondition(50, { columnId: 'col', operator: 'less_than', value: '100' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'less_than', value: '100' }, 'number')).toBe(false)
    expect(evaluateCondition(150, { columnId: 'col', operator: 'less_than', value: '100' }, 'number')).toBe(false)
  })

  it('evaluates greater_equal', () => {
    expect(evaluateCondition(100, { columnId: 'col', operator: 'greater_equal', value: '100' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'greater_equal', value: '50' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'greater_equal', value: '150' }, 'number')).toBe(false)
  })

  it('evaluates less_equal', () => {
    expect(evaluateCondition(100, { columnId: 'col', operator: 'less_equal', value: '100' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'less_equal', value: '150' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'less_equal', value: '50' }, 'number')).toBe(false)
  })

  it('evaluates between for numbers', () => {
    expect(evaluateCondition(50, { columnId: 'col', operator: 'between', value: '0', value2: '100' }, 'number')).toBe(true)
    expect(evaluateCondition(0, { columnId: 'col', operator: 'between', value: '0', value2: '100' }, 'number')).toBe(true)
    expect(evaluateCondition(100, { columnId: 'col', operator: 'between', value: '0', value2: '100' }, 'number')).toBe(true)
    expect(evaluateCondition(150, { columnId: 'col', operator: 'between', value: '0', value2: '100' }, 'number')).toBe(false)
  })

  it('handles decimal numbers', () => {
    expect(evaluateCondition(3.14, { columnId: 'col', operator: 'equals', value: '3.14' }, 'number')).toBe(true)
    expect(evaluateCondition(3.14, { columnId: 'col', operator: 'greater_than', value: '3' }, 'number')).toBe(true)
  })

  it('handles negative numbers', () => {
    expect(evaluateCondition(-50, { columnId: 'col', operator: 'less_than', value: '0' }, 'number')).toBe(true)
    expect(evaluateCondition(-50, { columnId: 'col', operator: 'greater_equal', value: '-100' }, 'number')).toBe(true)
  })
})

// ============================================================================
// evaluateCondition - Boolean Operations
// ============================================================================

describe('evaluateCondition - Boolean Operations', () => {
  it('evaluates boolean true values', () => {
    expect(evaluateCondition('true', { columnId: 'col', operator: 'equals', value: 'true' }, 'boolean')).toBe(true)
    expect(evaluateCondition('1', { columnId: 'col', operator: 'equals', value: 'true' }, 'boolean')).toBe(true)
    expect(evaluateCondition('yes', { columnId: 'col', operator: 'equals', value: 'true' }, 'boolean')).toBe(true)
    expect(evaluateCondition('TRUE', { columnId: 'col', operator: 'equals', value: 'true' }, 'boolean')).toBe(true)
  })

  it('evaluates boolean false values', () => {
    expect(evaluateCondition('false', { columnId: 'col', operator: 'equals', value: 'false' }, 'boolean')).toBe(true)
    expect(evaluateCondition('0', { columnId: 'col', operator: 'equals', value: 'false' }, 'boolean')).toBe(true)
    expect(evaluateCondition('no', { columnId: 'col', operator: 'equals', value: 'false' }, 'boolean')).toBe(true)
  })

  it('evaluates boolean not_equals', () => {
    expect(evaluateCondition('true', { columnId: 'col', operator: 'not_equals', value: 'false' }, 'boolean')).toBe(true)
    expect(evaluateCondition('false', { columnId: 'col', operator: 'not_equals', value: 'true' }, 'boolean')).toBe(true)
  })
})

// ============================================================================
// evaluateCondition - Date Operations
// ============================================================================

describe('evaluateCondition - Date Operations', () => {
  it('evaluates date equals', () => {
    expect(evaluateCondition('2024-03-15', { columnId: 'col', operator: 'equals', value: '2024-03-15' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-03-15', { columnId: 'col', operator: 'equals', value: '2024-03-16' }, 'date')).toBe(false)
  })

  it('evaluates date greater_equal (on or after)', () => {
    expect(evaluateCondition('2024-03-15', { columnId: 'col', operator: 'greater_equal', value: '2024-03-15' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-03-16', { columnId: 'col', operator: 'greater_equal', value: '2024-03-15' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-03-14', { columnId: 'col', operator: 'greater_equal', value: '2024-03-15' }, 'date')).toBe(false)
  })

  it('evaluates date less_equal (on or before)', () => {
    expect(evaluateCondition('2024-03-15', { columnId: 'col', operator: 'less_equal', value: '2024-03-15' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-03-14', { columnId: 'col', operator: 'less_equal', value: '2024-03-15' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-03-16', { columnId: 'col', operator: 'less_equal', value: '2024-03-15' }, 'date')).toBe(false)
  })

  it('evaluates date between', () => {
    expect(evaluateCondition('2024-03-15', { columnId: 'col', operator: 'between', value: '2024-03-01', value2: '2024-03-31' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-03-01', { columnId: 'col', operator: 'between', value: '2024-03-01', value2: '2024-03-31' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-04-01', { columnId: 'col', operator: 'between', value: '2024-03-01', value2: '2024-03-31' }, 'date')).toBe(false)
  })

  it('handles invalid date strings gracefully', () => {
    expect(evaluateCondition('not-a-date', { columnId: 'col', operator: 'equals', value: '2024-03-15' }, 'date')).toBe(false)
  })

  it('handles empty filter value (returns true - no filter)', () => {
    expect(evaluateCondition('2024-03-15', { columnId: 'col', operator: 'equals', value: '' }, 'date')).toBe(true)
    expect(evaluateCondition('2024-03-15', { columnId: 'col', operator: 'greater_equal', value: '' }, 'date')).toBe(true)
  })
})

// ============================================================================
// evaluateCondition - Null/Empty Checks
// ============================================================================

describe('evaluateCondition - Null/Empty Checks', () => {
  it('evaluates is_null', () => {
    expect(evaluateCondition(null, { columnId: 'col', operator: 'is_null', value: '' }, 'string')).toBe(true)
    expect(evaluateCondition(undefined, { columnId: 'col', operator: 'is_null', value: '' }, 'string')).toBe(true)
    expect(evaluateCondition('', { columnId: 'col', operator: 'is_null', value: '' }, 'string')).toBe(true)
    expect(evaluateCondition('value', { columnId: 'col', operator: 'is_null', value: '' }, 'string')).toBe(false)
  })

  it('evaluates is_not_null', () => {
    expect(evaluateCondition('value', { columnId: 'col', operator: 'is_not_null', value: '' }, 'string')).toBe(true)
    expect(evaluateCondition(null, { columnId: 'col', operator: 'is_not_null', value: '' }, 'string')).toBe(false)
    expect(evaluateCondition('', { columnId: 'col', operator: 'is_not_null', value: '' }, 'string')).toBe(false)
  })

  it('returns false for non-null operators on empty values', () => {
    expect(evaluateCondition(null, { columnId: 'col', operator: 'equals', value: 'test' }, 'string')).toBe(false)
    expect(evaluateCondition('', { columnId: 'col', operator: 'contains', value: 'test' }, 'string')).toBe(false)
  })
})

// ============================================================================
// evaluateCondition - Multi-Select (Enum) Operations
// ============================================================================

describe('evaluateCondition - Multi-Select (Enum)', () => {
  it('evaluates single value match', () => {
    expect(evaluateCondition('Active', { columnId: 'col', operator: 'contains', value: 'Active' }, 'string')).toBe(true)
  })

  it('evaluates multi-select match (any of)', () => {
    // Multi-select values are separated by |||
    expect(evaluateCondition('Active', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(true)
    expect(evaluateCondition('Pending', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(true)
    expect(evaluateCondition('Inactive', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(false)
  })

  it('handles case-insensitive multi-select', () => {
    expect(evaluateCondition('ACTIVE', { columnId: 'col', operator: 'contains', value: 'active|||pending' }, 'string')).toBe(true)
    expect(evaluateCondition('active', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(true)
  })
})

// ============================================================================
// applyFilters - Full Row Filtering
// ============================================================================

describe('applyFilters', () => {
  const columns: ColumnSchema[] = [
    { id: 'name', name: 'Name', type: 'string', nullable: true },
    { id: 'age', name: 'Age', type: 'number', nullable: true },
    { id: 'status', name: 'Status', type: 'string', nullable: true },
  ]

  const rows: TestRow[] = [
    createRow('1', { name: 'Alice', age: 30, status: 'Active' }),
    createRow('2', { name: 'Bob', age: 25, status: 'Pending' }),
    createRow('3', { name: 'Charlie', age: 35, status: 'Active' }),
    createRow('4', { name: 'Diana', age: 28, status: 'Inactive' }),
  ]

  it('returns all rows when no filters', () => {
    const result = applyFilters(rows, { conditions: [], logic: 'and' }, columns, identityDisplayValue)
    expect(result).toHaveLength(4)
  })

  it('filters by single condition', () => {
    const result = applyFilters(
      rows,
      { conditions: [{ columnId: 'status', operator: 'equals', value: 'Active' }], logic: 'and' },
      columns,
      identityDisplayValue
    )
    expect(result).toHaveLength(2)
    expect(result.map(r => r.name)).toEqual(['Alice', 'Charlie'])
  })

  it('filters with AND logic', () => {
    const result = applyFilters(
      rows,
      {
        conditions: [
          { columnId: 'status', operator: 'equals', value: 'Active' },
          { columnId: 'age', operator: 'greater_than', value: '30' },
        ],
        logic: 'and',
      },
      columns,
      identityDisplayValue
    )
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Charlie')
  })

  it('filters with OR logic', () => {
    const result = applyFilters(
      rows,
      {
        conditions: [
          { columnId: 'status', operator: 'equals', value: 'Inactive' },
          { columnId: 'age', operator: 'less_than', value: '26' },
        ],
        logic: 'or',
      },
      columns,
      identityDisplayValue
    )
    expect(result).toHaveLength(2)
    expect(result.map(r => r.name)).toEqual(['Bob', 'Diana'])
  })

  it('handles number range filtering', () => {
    const result = applyFilters(
      rows,
      { conditions: [{ columnId: 'age', operator: 'between', value: '26', value2: '32' }], logic: 'and' },
      columns,
      identityDisplayValue
    )
    expect(result).toHaveLength(2)
    expect(result.map(r => r.name)).toEqual(['Alice', 'Diana'])
  })
})

// ============================================================================
// Type Detection and Configuration
// ============================================================================

describe('isEnumColumn', () => {
  it('returns true for string column with few unique values', () => {
    expect(isEnumColumn('string', 5)).toBe(true)
    expect(isEnumColumn('string', 15)).toBe(true)
  })

  it('returns false for string column with many unique values', () => {
    expect(isEnumColumn('string', 16)).toBe(false)
    expect(isEnumColumn('string', 100)).toBe(false)
  })

  it('returns false for non-string columns', () => {
    expect(isEnumColumn('number', 5)).toBe(false)
    expect(isEnumColumn('date', 5)).toBe(false)
    expect(isEnumColumn('boolean', 2)).toBe(false)
  })

  it('returns false for zero unique values', () => {
    expect(isEnumColumn('string', 0)).toBe(false)
  })
})

describe('getEffectiveFilterType', () => {
  it('returns enum for low-cardinality string columns', () => {
    expect(getEffectiveFilterType('string', 10)).toBe('enum')
  })

  it('returns original type for high-cardinality strings', () => {
    expect(getEffectiveFilterType('string', 50)).toBe('string')
  })

  it('returns original type for non-strings', () => {
    expect(getEffectiveFilterType('number', 5)).toBe('number')
    expect(getEffectiveFilterType('date', 5)).toBe('date')
  })
})

describe('getOperatorsForType', () => {
  it('returns correct operators for string', () => {
    const ops = getOperatorsForType('string')
    expect(ops).toContain('equals')
    expect(ops).toContain('contains')
    expect(ops).toContain('is_null')
  })

  it('returns correct operators for number', () => {
    const ops = getOperatorsForType('number')
    expect(ops).toContain('equals')
    expect(ops).toContain('greater_equal')
    expect(ops).toContain('between')
  })

  it('returns correct operators for date', () => {
    const ops = getOperatorsForType('date')
    expect(ops).toContain('equals')
    expect(ops).toContain('greater_equal')
    expect(ops).toContain('between')
  })

  it('returns correct operators for enum', () => {
    const ops = getOperatorsForType('enum')
    expect(ops).toContain('contains') // "is any of"
    expect(ops).toContain('is_null')
    expect(ops).not.toContain('equals')
  })

  it('returns correct operators for boolean', () => {
    const ops = getOperatorsForType('boolean')
    expect(ops).toContain('equals')
    expect(ops).toHaveLength(1)
  })
})

// ============================================================================
// Operator Labels
// ============================================================================

describe('getOperatorLabel', () => {
  it('returns context-aware labels for dates', () => {
    expect(getOperatorLabel('greater_equal', 'date')).toBe('is on or after')
    expect(getOperatorLabel('less_equal', 'date')).toBe('is on or before')
  })

  it('returns context-aware labels for numbers', () => {
    expect(getOperatorLabel('greater_equal', 'number')).toBe('is at least')
    expect(getOperatorLabel('less_equal', 'number')).toBe('is at most')
  })

  it('returns context-aware labels for enum', () => {
    expect(getOperatorLabel('contains', 'enum')).toBe('is any of')
  })

  it('returns default labels when no type specified', () => {
    expect(getOperatorLabel('equals')).toBe('is')
    expect(getOperatorLabel('not_equals')).toBe('is not')
  })
})

// ============================================================================
// Quick Date Options
// ============================================================================

describe('quickDateOptions', () => {
  it('has all expected presets', () => {
    const ids = quickDateOptions.map(o => o.id)
    expect(ids).toContain('today')
    expect(ids).toContain('yesterday')
    expect(ids).toContain('this_week')
    expect(ids).toContain('last_week')
    expect(ids).toContain('this_month')
    expect(ids).toContain('last_month')
    expect(ids).toContain('last_30_days')
    expect(ids).toContain('last_90_days')
  })

  it('today returns current date for both start and end', () => {
    const today = quickDateOptions.find(o => o.id === 'today')!
    const range = today.getRange()
    expect(range.start).toBe(range.end) // Same day
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/) // YYYY-MM-DD format
  })

  it('last_30_days returns 31-day range', () => {
    const last30 = quickDateOptions.find(o => o.id === 'last_30_days')!
    const range = last30.getRange()
    const start = new Date(range.start)
    const end = new Date(range.end)
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(30)
  })
})

// ============================================================================
// Helper Functions
// ============================================================================

describe('getUniqueValues', () => {
  const rows: TestRow[] = [
    createRow('1', { status: 'Active' }),
    createRow('2', { status: 'Pending' }),
    createRow('3', { status: 'Active' }),
    createRow('4', { status: 'Inactive' }),
    createRow('5', { status: null }),
  ]

  it('returns unique non-null values', () => {
    const values = getUniqueValues(rows, 'status', identityDisplayValue)
    expect(values).toHaveLength(3)
    expect(values).toContain('Active')
    expect(values).toContain('Pending')
    expect(values).toContain('Inactive')
  })

  it('respects limit parameter', () => {
    const values = getUniqueValues(rows, 'status', identityDisplayValue, 2)
    expect(values).toHaveLength(2)
  })

  it('sorts values', () => {
    const values = getUniqueValues(rows, 'status', identityDisplayValue)
    expect(values[0]).toBe('Active')
    expect(values[1]).toBe('Inactive')
    expect(values[2]).toBe('Pending')
  })
})

describe('countUniqueValues', () => {
  const rows: TestRow[] = [
    createRow('1', { category: 'A' }),
    createRow('2', { category: 'B' }),
    createRow('3', { category: 'A' }),
    createRow('4', { category: 'C' }),
  ]

  it('counts unique values correctly', () => {
    const count = countUniqueValues(rows, 'category', identityDisplayValue)
    expect(count).toBe(3)
  })

  it('early exits when exceeding threshold', () => {
    const count = countUniqueValues(rows, 'category', identityDisplayValue, 2)
    expect(count).toBeGreaterThan(2)
  })
})

describe('createFilterCondition', () => {
  it('creates condition with default operator for type', () => {
    const stringCondition = createFilterCondition('col1', 'string')
    expect(stringCondition.operator).toBe('equals')

    const numberCondition = createFilterCondition('col2', 'number')
    expect(numberCondition.operator).toBe('equals')
  })

  it('uses contains for enum type', () => {
    const enumCondition = createFilterCondition('col1', 'string', true)
    expect(enumCondition.operator).toBe('contains')
  })

  it('sets default value for boolean', () => {
    const boolCondition = createFilterCondition('col1', 'boolean')
    expect(boolCondition.value).toBe('true')
  })
})

describe('hasActiveFilters', () => {
  it('returns false for null/undefined/empty', () => {
    expect(hasActiveFilters(null)).toBe(false)
    expect(hasActiveFilters(undefined)).toBe(false)
    expect(hasActiveFilters({ conditions: [], logic: 'and' })).toBe(false)
  })

  it('returns true when conditions exist', () => {
    expect(hasActiveFilters({
      conditions: [{ columnId: 'col', operator: 'equals', value: 'test' }],
      logic: 'and'
    })).toBe(true)
  })
})

describe('countActiveFilters', () => {
  it('returns 0 for null/undefined', () => {
    expect(countActiveFilters(null)).toBe(0)
    expect(countActiveFilters(undefined)).toBe(0)
  })

  it('returns correct count', () => {
    expect(countActiveFilters({
      conditions: [
        { columnId: 'col1', operator: 'equals', value: 'a' },
        { columnId: 'col2', operator: 'equals', value: 'b' },
      ],
      logic: 'and'
    })).toBe(2)
  })
})

describe('createEmptyFilterConfig', () => {
  it('creates empty config with and logic', () => {
    const config = createEmptyFilterConfig()
    expect(config.conditions).toEqual([])
    expect(config.logic).toBe('and')
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('handles special characters in string values', () => {
    expect(evaluateCondition('Test "quoted"', { columnId: 'col', operator: 'contains', value: '"quoted"' }, 'string')).toBe(true)
    expect(evaluateCondition('Path/to/file', { columnId: 'col', operator: 'contains', value: '/' }, 'string')).toBe(true)
    expect(evaluateCondition('C:\\Windows', { columnId: 'col', operator: 'starts_with', value: 'C:\\' }, 'string')).toBe(true)
  })

  it('handles unicode characters', () => {
    expect(evaluateCondition('Café', { columnId: 'col', operator: 'contains', value: 'Café' }, 'string')).toBe(true)
    expect(evaluateCondition('日本語', { columnId: 'col', operator: 'equals', value: '日本語' }, 'string')).toBe(true)
  })

  it('handles very long strings', () => {
    const longString = 'a'.repeat(10000)
    expect(evaluateCondition(longString, { columnId: 'col', operator: 'starts_with', value: 'aaa' }, 'string')).toBe(true)
    expect(evaluateCondition(longString, { columnId: 'col', operator: 'ends_with', value: 'aaa' }, 'string')).toBe(true)
  })

  it('handles zero correctly in number comparisons', () => {
    expect(evaluateCondition(0, { columnId: 'col', operator: 'equals', value: '0' }, 'number')).toBe(true)
    expect(evaluateCondition(0, { columnId: 'col', operator: 'greater_equal', value: '0' }, 'number')).toBe(true)
    expect(evaluateCondition(0, { columnId: 'col', operator: 'less_equal', value: '0' }, 'number')).toBe(true)
  })

  it('handles missing value2 in between operator', () => {
    // Should return true (no filtering) when value2 is missing
    expect(evaluateCondition(50, { columnId: 'col', operator: 'between', value: '0', value2: undefined }, 'number')).toBe(true)
  })
})
