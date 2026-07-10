import { describe, expect, it } from 'vitest'
import type { CellValue } from '@/types'
import {
  countActiveFilters,
  countUniqueValues,
  createEmptyFilterConfig,
  createFilterCondition,
  evaluateCondition,
  getEffectiveFilterType,
  getOperatorLabel,
  getOperatorsForType,
  getUniqueValues,
  hasActiveFilters,
  isEnumColumn,
  quickDateOptions,
} from './filterUtils'

interface TestRow {
  __rowId: string
  [key: string]: string | number | boolean | null
}

const createRow = (id: string, data: Record<string, string | number | boolean | null>): TestRow => ({ __rowId: id, ...data })
const identityDisplayValue = (_rowId: string, _colId: string, base: CellValue): CellValue => base

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
    const operators = getOperatorsForType('string')
    expect(operators).toContain('equals')
    expect(operators).toContain('contains')
    expect(operators).toContain('is_null')
  })
  it('returns correct operators for number', () => {
    const operators = getOperatorsForType('number')
    expect(operators).toContain('equals')
    expect(operators).toContain('greater_equal')
    expect(operators).toContain('between')
  })
  it('returns correct operators for date', () => {
    const operators = getOperatorsForType('date')
    expect(operators).toContain('equals')
    expect(operators).toContain('greater_equal')
    expect(operators).toContain('between')
  })
  it('returns correct operators for enum', () => {
    const operators = getOperatorsForType('enum')
    expect(operators).toContain('contains')
    expect(operators).toContain('is_null')
    expect(operators).not.toContain('equals')
  })
  it('returns correct operators for boolean', () => {
    const operators = getOperatorsForType('boolean')
    expect(operators).toContain('equals')
    expect(operators).toHaveLength(1)
  })
})

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

describe('quickDateOptions', () => {
  it('has all expected presets', () => {
    const ids = quickDateOptions.map(option => option.id)
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
    const range = quickDateOptions.find(option => option.id === 'today')!.getRange()
    expect(range.start).toBe(range.end)
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('last_30_days returns 31-day range', () => {
    const range = quickDateOptions.find(option => option.id === 'last_30_days')!.getRange()
    const diffDays = Math.round((new Date(range.end).getTime() - new Date(range.start).getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(30)
  })
})

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
    expect(getUniqueValues(rows, 'status', identityDisplayValue, 2)).toHaveLength(2)
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
    expect(countUniqueValues(rows, 'category', identityDisplayValue)).toBe(3)
  })
  it('early exits when exceeding threshold', () => {
    expect(countUniqueValues(rows, 'category', identityDisplayValue, 2)).toBeGreaterThan(2)
  })
})

describe('createFilterCondition', () => {
  it('creates condition with default operator for type', () => {
    expect(createFilterCondition('col1', 'string').operator).toBe('equals')
    expect(createFilterCondition('col2', 'number').operator).toBe('equals')
  })
  it('uses contains for enum type', () => {
    expect(createFilterCondition('col1', 'string', true).operator).toBe('contains')
  })
  it('sets default value for boolean', () => {
    expect(createFilterCondition('col1', 'boolean').value).toBe('true')
  })
})

describe('hasActiveFilters', () => {
  it('returns false for null/undefined/empty', () => {
    expect(hasActiveFilters(null)).toBe(false)
    expect(hasActiveFilters(undefined)).toBe(false)
    expect(hasActiveFilters({ conditions: [], logic: 'and' })).toBe(false)
  })
  it('returns true when conditions exist', () => {
    expect(hasActiveFilters({ conditions: [{ columnId: 'col', operator: 'equals', value: 'test' }], logic: 'and' })).toBe(true)
  })
})

describe('countActiveFilters', () => {
  it('returns 0 for null/undefined', () => {
    expect(countActiveFilters(null)).toBe(0)
    expect(countActiveFilters(undefined)).toBe(0)
  })
  it('returns correct count', () => {
    expect(countActiveFilters({ conditions: [
      { columnId: 'col1', operator: 'equals', value: 'a' },
      { columnId: 'col2', operator: 'equals', value: 'b' },
    ], logic: 'and' })).toBe(2)
  })
})

describe('createEmptyFilterConfig', () => {
  it('creates empty config with and logic', () => {
    const config = createEmptyFilterConfig()
    expect(config.conditions).toEqual([])
    expect(config.logic).toBe('and')
  })
})

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
    expect(evaluateCondition(50, { columnId: 'col', operator: 'between', value: '0', value2: undefined }, 'number')).toBe(true)
  })
})
