import type { CellValue, ColumnType, FilterCondition, FilterOperator, ViewFilterConfig } from '@/types'

export type FilterColumnType = ColumnType | 'enum'

export const ENUM_THRESHOLD = 15

export function isEnumColumn(columnType: ColumnType, uniqueValueCount: number): boolean {
  return columnType === 'string' && uniqueValueCount > 0 && uniqueValueCount <= ENUM_THRESHOLD
}

export function getEffectiveFilterType(columnType: ColumnType, uniqueValueCount: number): FilterColumnType {
  return isEnumColumn(columnType, uniqueValueCount) ? 'enum' : columnType
}

const operatorsByType: Record<FilterColumnType, FilterOperator[]> = {
  string: ['equals', 'not_equals', 'contains', 'is_null'],
  enum: ['contains', 'is_null'],
  number: ['equals', 'greater_equal', 'less_equal', 'between', 'is_null'],
  boolean: ['equals'],
  date: ['equals', 'greater_equal', 'less_equal', 'between', 'is_null'],
  datetime: ['equals', 'greater_equal', 'less_equal', 'between', 'is_null'],
  unknown: ['equals', 'not_equals', 'contains', 'is_null'],
}

export function getOperatorsForType(filterType: FilterColumnType): FilterOperator[] {
  return operatorsByType[filterType] ?? operatorsByType.string
}

const defaultLabels: Record<FilterOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  contains: 'contains',
  not_contains: 'excludes',
  starts_with: 'starts with',
  ends_with: 'ends with',
  greater_than: 'is more than',
  less_than: 'is less than',
  greater_equal: 'is at least',
  less_equal: 'is at most',
  between: 'is between',
  is_null: 'is empty',
  is_not_null: 'is not empty',
}

const labelsByType: Partial<Record<FilterColumnType, Partial<Record<FilterOperator, string>>>> = {
  date: { equals: 'is exactly', greater_equal: 'is on or after', less_equal: 'is on or before', between: 'is between', is_null: 'is empty' },
  datetime: { equals: 'is exactly', greater_equal: 'is on or after', less_equal: 'is on or before', between: 'is between', is_null: 'is empty' },
  number: { equals: 'equals', greater_equal: 'is at least', less_equal: 'is at most', between: 'is between', is_null: 'is empty' },
  enum: { contains: 'is any of', is_null: 'is empty' },
}

export function getOperatorLabel(operator: FilterOperator, filterType?: FilterColumnType): string {
  return labelsByType[filterType ?? 'string']?.[operator] ?? defaultLabels[operator] ?? operator
}

export function createEmptyFilterConfig(): ViewFilterConfig {
  return { conditions: [], logic: 'and' }
}

export function createFilterCondition(columnId: string, columnType: ColumnType, isEnum = false): FilterCondition {
  const operators = getOperatorsForType(isEnum ? 'enum' : columnType)
  return { columnId, operator: operators[0], value: columnType === 'boolean' ? 'true' : '' }
}

export function hasActiveFilters(filters: ViewFilterConfig | null | undefined): boolean {
  return !!filters && filters.conditions.length > 0
}

export function countActiveFilters(filters: ViewFilterConfig | null | undefined): number {
  return filters?.conditions.length ?? 0
}

export function isEmptyFilterValue(value: CellValue | undefined): boolean {
  return value === null || value === undefined || value === ''
}
