import { describe, expect, it } from 'vitest'
import type { CellValue, ColumnSchema } from '@/types'
import { applyFilters, evaluateCondition } from './filterUtils'

interface TestRow {
  __rowId: string
  [key: string]: string | number | boolean | null
}

const createRow = (id: string, data: Record<string, string | number | boolean | null>): TestRow => ({ __rowId: id, ...data })
const identityDisplayValue = (_rowId: string, _colId: string, base: CellValue): CellValue => base

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
    expect(evaluateCondition('Hello World', { columnId: 'col', operator: 'contains', value: 'world' }, 'string')).toBe(true)
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

describe('evaluateCondition - Null/Empty Checks', () => {
  it('evaluates is_null', () => {
    expect(evaluateCondition(null, { columnId: 'col', operator: 'is_null', value: '' }, 'string')).toBe(true)
    expect(evaluateCondition(null, { columnId: 'col', operator: 'is_null', value: '' }, 'string')).toBe(true)
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

describe('evaluateCondition - Multi-Select (Enum)', () => {
  it('evaluates single value match', () => {
    expect(evaluateCondition('Active', { columnId: 'col', operator: 'contains', value: 'Active' }, 'string')).toBe(true)
  })
  it('evaluates multi-select match (any of)', () => {
    expect(evaluateCondition('Active', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(true)
    expect(evaluateCondition('Pending', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(true)
    expect(evaluateCondition('Inactive', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(false)
  })
  it('handles case-insensitive multi-select', () => {
    expect(evaluateCondition('ACTIVE', { columnId: 'col', operator: 'contains', value: 'active|||pending' }, 'string')).toBe(true)
    expect(evaluateCondition('active', { columnId: 'col', operator: 'contains', value: 'Active|||Pending' }, 'string')).toBe(true)
  })
})

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
    expect(applyFilters(rows, { conditions: [], logic: 'and' }, columns, identityDisplayValue)).toHaveLength(4)
  })
  it('filters by single condition', () => {
    const result = applyFilters(rows, { conditions: [{ columnId: 'status', operator: 'equals', value: 'Active' }], logic: 'and' }, columns, identityDisplayValue)
    expect(result).toHaveLength(2)
    expect(result.map(row => row.name)).toEqual(['Alice', 'Charlie'])
  })
  it('filters with AND logic', () => {
    const result = applyFilters(rows, { conditions: [
      { columnId: 'status', operator: 'equals', value: 'Active' },
      { columnId: 'age', operator: 'greater_than', value: '30' },
    ], logic: 'and' }, columns, identityDisplayValue)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Charlie')
  })
  it('filters with OR logic', () => {
    const result = applyFilters(rows, { conditions: [
      { columnId: 'status', operator: 'equals', value: 'Inactive' },
      { columnId: 'age', operator: 'less_than', value: '26' },
    ], logic: 'or' }, columns, identityDisplayValue)
    expect(result).toHaveLength(2)
    expect(result.map(row => row.name)).toEqual(['Bob', 'Diana'])
  })
  it('handles number range filtering', () => {
    const result = applyFilters(rows, { conditions: [{ columnId: 'age', operator: 'between', value: '26', value2: '32' }], logic: 'and' }, columns, identityDisplayValue)
    expect(result).toHaveLength(2)
    expect(result.map(row => row.name)).toEqual(['Alice', 'Diana'])
  })
})
