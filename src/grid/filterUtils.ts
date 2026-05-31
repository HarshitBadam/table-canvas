import { CellValue, ColumnSchema, FilterCondition, FilterOperator, ColumnType, ViewFilterConfig } from '@/types'
import type { GridRow } from './types'
import { formatDateForInput } from './dateFilterUtils'

export type { QuickDateFilter, QuickDateOption } from './dateFilterUtils'
export { quickDateOptions } from './dateFilterUtils'

export type FilterColumnType = ColumnType | 'enum'

const ENUM_THRESHOLD = 15

export function isEnumColumn(
  columnType: ColumnType,
  uniqueValueCount: number
): boolean {
  if (columnType !== 'string') return false
  return uniqueValueCount > 0 && uniqueValueCount <= ENUM_THRESHOLD
}

export function getEffectiveFilterType(
  columnType: ColumnType,
  uniqueValueCount: number
): FilterColumnType {
  if (isEnumColumn(columnType, uniqueValueCount)) {
    return 'enum'
  }
  return columnType
}

export function getOperatorsForType(filterType: FilterColumnType): FilterOperator[] {
  switch (filterType) {
    case 'string':
      return [
        'equals',
        'not_equals',
        'contains',
        'is_null',
      ]
    case 'enum':
      // Enum uses "contains" for multi-select (is any of)
      return [
        'contains',  // "is any of" - multi-select
        'is_null',
      ]
    case 'number':
      return [
        'equals',
        'greater_equal',
        'less_equal',
        'between',
        'is_null',
      ]
    case 'boolean':
      // Boolean just uses equals - UI shows as toggle
      return [
        'equals',
      ]
    case 'date':
    case 'datetime':
      return [
        'equals',
        'greater_equal',  // "on or after"
        'less_equal',     // "on or before"
        'between',
        'is_null',
      ]
    default:
      return [
        'equals',
        'not_equals',
        'contains',
        'is_null',
      ]
  }
}

export function getOperatorLabel(operator: FilterOperator, filterType?: FilterColumnType): string {
  if (filterType === 'date' || filterType === 'datetime') {
    const dateLabels: Partial<Record<FilterOperator, string>> = {
      equals: 'is exactly',
      greater_equal: 'is on or after',
      less_equal: 'is on or before',
      between: 'is between',
      is_null: 'is empty',
    }
    if (dateLabels[operator]) return dateLabels[operator]!
  }

  if (filterType === 'number') {
    const numberLabels: Partial<Record<FilterOperator, string>> = {
      equals: 'equals',
      greater_equal: 'is at least',
      less_equal: 'is at most',
      between: 'is between',
      is_null: 'is empty',
    }
    if (numberLabels[operator]) return numberLabels[operator]!
  }

  if (filterType === 'enum') {
    const enumLabels: Partial<Record<FilterOperator, string>> = {
      contains: 'is any of',
      is_null: 'is empty',
    }
    if (enumLabels[operator]) return enumLabels[operator]!
  }

  const labels: Record<FilterOperator, string> = {
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
  return labels[operator] || operator
}

function isEmpty(value: CellValue): boolean {
  return value === null || value === undefined || value === ''
}

function normalizeForComparison(value: CellValue): string | number | boolean | null {
  if (isEmpty(value)) return null
  if (typeof value === 'string') return value.toLowerCase()
  return value
}

export function evaluateCondition(
  cellValue: CellValue,
  condition: FilterCondition,
  columnType: ColumnType
): boolean {
  const { operator, value: filterValue, value2: filterValue2 } = condition

  if (operator === 'is_null') {
    return isEmpty(cellValue)
  }
  if (operator === 'is_not_null') {
    return !isEmpty(cellValue)
  }

  if (isEmpty(cellValue)) {
    return false
  }

  const normalizedCell = normalizeForComparison(cellValue)
  const normalizedFilter = normalizeForComparison(filterValue ?? null)

  switch (operator) {
    case 'equals': {
      if (columnType === 'boolean') {
        const cellBool = String(cellValue).toLowerCase()
        const filterBool = String(filterValue).toLowerCase()
        const truthy = ['true', '1', 'yes']
        const falsy = ['false', '0', 'no']
        if (truthy.includes(filterBool)) {
          return truthy.includes(cellBool)
        }
        if (falsy.includes(filterBool)) {
          return falsy.includes(cellBool)
        }
      }
      if (columnType === 'number' && typeof cellValue === 'number') {
        return cellValue === Number(filterValue)
      }
      if (columnType === 'date' || columnType === 'datetime') {
        // Skip comparison if filter value is empty
        if (!filterValue) return true
        // Compare dates by their date string (YYYY-MM-DD)
        const cellDateObj = new Date(String(cellValue))
        const filterDateObj = new Date(String(filterValue))
        if (isNaN(cellDateObj.getTime()) || isNaN(filterDateObj.getTime())) return false
        const cellDate = formatDateForInput(cellDateObj)
        const filterDate = formatDateForInput(filterDateObj)
        return cellDate === filterDate
      }
      return normalizedCell === normalizedFilter
    }

    case 'not_equals': {
      if (columnType === 'boolean') {
        const cellBool = String(cellValue).toLowerCase()
        const filterBool = String(filterValue).toLowerCase()
        const truthy = ['true', '1', 'yes']
        const falsy = ['false', '0', 'no']
        if (truthy.includes(filterBool)) {
          return !truthy.includes(cellBool)
        }
        if (falsy.includes(filterBool)) {
          return !falsy.includes(cellBool)
        }
      }
      if (columnType === 'number' && typeof cellValue === 'number') {
        return cellValue !== Number(filterValue)
      }
      return normalizedCell !== normalizedFilter
    }

    case 'contains': {
      // Handle multi-select values (separated by |||)
      const filterStr = String(filterValue)
      if (filterStr.includes('|||')) {
        const selectedValues = filterStr.split('|||').filter(Boolean)
        const cellStr = String(cellValue).toLowerCase()
        // For enum multi-select: exact match against any selected value
        return selectedValues.some(v => cellStr === v.toLowerCase())
      }
      if (typeof normalizedCell === 'string' && typeof normalizedFilter === 'string') {
        return normalizedCell.includes(normalizedFilter)
      }
      return String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase())
    }

    case 'not_contains': {
      if (typeof normalizedCell === 'string' && typeof normalizedFilter === 'string') {
        return !normalizedCell.includes(normalizedFilter)
      }
      return !String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase())
    }

    case 'starts_with': {
      if (typeof normalizedCell === 'string' && typeof normalizedFilter === 'string') {
        return normalizedCell.startsWith(normalizedFilter)
      }
      return String(cellValue).toLowerCase().startsWith(String(filterValue).toLowerCase())
    }

    case 'ends_with': {
      if (typeof normalizedCell === 'string' && typeof normalizedFilter === 'string') {
        return normalizedCell.endsWith(normalizedFilter)
      }
      return String(cellValue).toLowerCase().endsWith(String(filterValue).toLowerCase())
    }

    case 'greater_than': {
      if (columnType === 'number') {
        return Number(cellValue) > Number(filterValue)
      }
      if (columnType === 'date' || columnType === 'datetime') {
        if (!filterValue) return true
        const cellDate = new Date(String(cellValue))
        const filterDate = new Date(String(filterValue))
        if (isNaN(cellDate.getTime()) || isNaN(filterDate.getTime())) return false
        return cellDate > filterDate
      }
      return String(cellValue) > String(filterValue)
    }

    case 'less_than': {
      if (columnType === 'number') {
        return Number(cellValue) < Number(filterValue)
      }
      if (columnType === 'date' || columnType === 'datetime') {
        if (!filterValue) return true
        const cellDate = new Date(String(cellValue))
        const filterDate = new Date(String(filterValue))
        if (isNaN(cellDate.getTime()) || isNaN(filterDate.getTime())) return false
        return cellDate < filterDate
      }
      return String(cellValue) < String(filterValue)
    }

    case 'greater_equal': {
      if (columnType === 'number') {
        return Number(cellValue) >= Number(filterValue)
      }
      if (columnType === 'date' || columnType === 'datetime') {
        if (!filterValue) return true
        const cellDate = new Date(String(cellValue))
        const filterDate = new Date(String(filterValue))
        if (isNaN(cellDate.getTime()) || isNaN(filterDate.getTime())) return false
        return cellDate >= filterDate
      }
      return String(cellValue) >= String(filterValue)
    }

    case 'less_equal': {
      if (columnType === 'number') {
        return Number(cellValue) <= Number(filterValue)
      }
      if (columnType === 'date' || columnType === 'datetime') {
        if (!filterValue) return true
        const cellDate = new Date(String(cellValue))
        const filterDate = new Date(String(filterValue))
        if (isNaN(cellDate.getTime()) || isNaN(filterDate.getTime())) return false
        return cellDate <= filterDate
      }
      return String(cellValue) <= String(filterValue)
    }

    case 'between': {
      if (filterValue2 === undefined || !filterValue) return true
      if (columnType === 'number') {
        const num = Number(cellValue)
        return num >= Number(filterValue) && num <= Number(filterValue2)
      }
      if (columnType === 'date' || columnType === 'datetime') {
        const date = new Date(String(cellValue))
        const startDate = new Date(String(filterValue))
        const endDate = new Date(String(filterValue2))
        if (isNaN(date.getTime()) || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false
        // Set end date to end of day for inclusive comparison
        endDate.setHours(23, 59, 59, 999)
        return date >= startDate && date <= endDate
      }
      return String(cellValue) >= String(filterValue) && String(cellValue) <= String(filterValue2)
    }

    default:
      return true
  }
}

export function applyFilters(
  rows: GridRow[],
  filters: ViewFilterConfig,
  columns: ColumnSchema[],
  getDisplayValue: (rowId: string, colId: string, base: CellValue, row?: GridRow) => CellValue
): GridRow[] {
  if (!filters || filters.conditions.length === 0) {
    return rows
  }

  const columnTypeMap = new Map<string, ColumnType>()
  columns.forEach(col => columnTypeMap.set(col.id, col.type))

  return rows.filter(row => {
    const results = filters.conditions.map(condition => {
      const baseValue = row[condition.columnId]
      const value = getDisplayValue(row.__rowId, condition.columnId, baseValue, row)
      const columnType = columnTypeMap.get(condition.columnId) || 'string'
      return evaluateCondition(value, condition, columnType)
    })

    if (filters.logic === 'and') {
      return results.every(r => r)
    } else {
      return results.some(r => r)
    }
  })
}

export function getUniqueValues(
  rows: GridRow[],
  columnId: string,
  getDisplayValue: (rowId: string, colId: string, base: CellValue, row?: GridRow) => CellValue,
  limit: number = 100
): CellValue[] {
  const seen = new Set<string>()
  const values: CellValue[] = []

  for (const row of rows) {
    if (values.length >= limit) break
    
    const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
    const key = String(value)
    
    if (!seen.has(key) && !isEmpty(value)) {
      seen.add(key)
      values.push(value)
    }
  }

  return values.sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b
    }
    return String(a).localeCompare(String(b))
  })
}

export function countUniqueValues(
  rows: GridRow[],
  columnId: string,
  getDisplayValue: (rowId: string, colId: string, base: CellValue, row?: GridRow) => CellValue,
  maxCheck: number = ENUM_THRESHOLD + 1
): number {
  const seen = new Set<string>()

  for (const row of rows) {
    if (seen.size > maxCheck) break
    
    const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
    if (!isEmpty(value)) {
      seen.add(String(value).toLowerCase())
    }
  }

  return seen.size
}

export function createEmptyFilterConfig(): ViewFilterConfig {
  return {
    conditions: [],
    logic: 'and',
  }
}

export function createFilterCondition(
  columnId: string, 
  columnType: ColumnType,
  isEnum: boolean = false
): FilterCondition {
  const effectiveType = isEnum ? 'enum' : columnType
  const operators = getOperatorsForType(effectiveType)
  
  let defaultValue: CellValue = ''
  
  if (columnType === 'boolean') {
    defaultValue = 'true'
  }
  
  return {
    columnId,
    operator: operators[0],
    value: defaultValue,
  }
}

export function hasActiveFilters(filters: ViewFilterConfig | null | undefined): boolean {
  return !!filters && filters.conditions.length > 0
}

export function countActiveFilters(filters: ViewFilterConfig | null | undefined): number {
  return filters?.conditions.length ?? 0
}
