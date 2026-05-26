import { CellValue, ColumnSchema, FilterCondition, FilterOperator, ColumnType } from '@/types'

// Grid row type (matches GridView)
interface GridRow {
  __rowId: string
  [columnId: string]: CellValue
}

// Filter configuration for the grid view
export interface GridFilterConfig {
  conditions: FilterCondition[]
  logic: 'and' | 'or'
}

// Extended filter type that includes enum detection
export type FilterColumnType = ColumnType | 'enum'

// Threshold for treating a string column as an enum (multi-select)
const ENUM_THRESHOLD = 15

// Check if a column should be treated as an enum based on unique values
export function isEnumColumn(
  columnType: ColumnType,
  uniqueValueCount: number
): boolean {
  // Only string columns can be treated as enums
  if (columnType !== 'string') return false
  return uniqueValueCount > 0 && uniqueValueCount <= ENUM_THRESHOLD
}

// Get the effective filter type for a column (including enum detection)
export function getEffectiveFilterType(
  columnType: ColumnType,
  uniqueValueCount: number
): FilterColumnType {
  if (isEnumColumn(columnType, uniqueValueCount)) {
    return 'enum'
  }
  return columnType
}

// Get operators available for a column type (refined per type)
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

// Human-readable labels for operators (context-aware based on type)
export function getOperatorLabel(operator: FilterOperator, filterType?: FilterColumnType): string {
  // Type-specific labels
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

  // Default labels
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

// Quick date filter presets
export type QuickDateFilter = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_30_days' | 'last_90_days'

export interface QuickDateOption {
  id: QuickDateFilter
  label: string
  getRange: () => { start: string; end: string }
}

// Helper to format date as YYYY-MM-DD for date inputs
function formatDateForInput(date: Date): string {
  // Safety check for invalid dates
  if (isNaN(date.getTime())) {
    return ''
  }
  // Use local date parts to avoid timezone issues
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Get start of day
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// Get end of day
function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

// Get start of week (Monday)
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return startOfDay(d)
}

// Get end of week (Sunday)
function endOfWeek(date: Date): Date {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return endOfDay(end)
}

// Get start of month
function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  return startOfDay(d)
}

// Get end of month
function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return endOfDay(d)
}

export const quickDateOptions: QuickDateOption[] = [
  {
    id: 'today',
    label: 'Today',
    getRange: () => {
      const today = new Date()
      return {
        start: formatDateForInput(startOfDay(today)),
        end: formatDateForInput(endOfDay(today)),
      }
    },
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    getRange: () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return {
        start: formatDateForInput(startOfDay(yesterday)),
        end: formatDateForInput(endOfDay(yesterday)),
      }
    },
  },
  {
    id: 'this_week',
    label: 'This Week',
    getRange: () => {
      const today = new Date()
      return {
        start: formatDateForInput(startOfWeek(today)),
        end: formatDateForInput(endOfWeek(today)),
      }
    },
  },
  {
    id: 'last_week',
    label: 'Last Week',
    getRange: () => {
      const lastWeek = new Date()
      lastWeek.setDate(lastWeek.getDate() - 7)
      return {
        start: formatDateForInput(startOfWeek(lastWeek)),
        end: formatDateForInput(endOfWeek(lastWeek)),
      }
    },
  },
  {
    id: 'this_month',
    label: 'This Month',
    getRange: () => {
      const today = new Date()
      return {
        start: formatDateForInput(startOfMonth(today)),
        end: formatDateForInput(endOfMonth(today)),
      }
    },
  },
  {
    id: 'last_month',
    label: 'Last Month',
    getRange: () => {
      const lastMonth = new Date()
      lastMonth.setMonth(lastMonth.getMonth() - 1)
      return {
        start: formatDateForInput(startOfMonth(lastMonth)),
        end: formatDateForInput(endOfMonth(lastMonth)),
      }
    },
  },
  {
    id: 'last_30_days',
    label: 'Last 30 Days',
    getRange: () => {
      const today = new Date()
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return {
        start: formatDateForInput(startOfDay(thirtyDaysAgo)),
        end: formatDateForInput(endOfDay(today)),
      }
    },
  },
  {
    id: 'last_90_days',
    label: 'Last 90 Days',
    getRange: () => {
      const today = new Date()
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      return {
        start: formatDateForInput(startOfDay(ninetyDaysAgo)),
        end: formatDateForInput(endOfDay(today)),
      }
    },
  },
]

// Check if a value is considered empty/null
function isEmpty(value: CellValue): boolean {
  return value === null || value === undefined || value === ''
}

// Normalize value for comparison (handle case sensitivity for strings)
function normalizeForComparison(value: CellValue): string | number | boolean | null {
  if (isEmpty(value)) return null
  if (typeof value === 'string') return value.toLowerCase()
  return value
}

// Evaluate a single filter condition against a cell value
export function evaluateCondition(
  cellValue: CellValue,
  condition: FilterCondition,
  columnType: ColumnType
): boolean {
  const { operator, value: filterValue, value2: filterValue2 } = condition

  // Handle null checks first
  if (operator === 'is_null') {
    return isEmpty(cellValue)
  }
  if (operator === 'is_not_null') {
    return !isEmpty(cellValue)
  }

  // For other operators, empty cells don't match
  if (isEmpty(cellValue)) {
    return false
  }

  // Normalize values for string comparisons
  const normalizedCell = normalizeForComparison(cellValue)
  const normalizedFilter = normalizeForComparison(filterValue ?? null)

  switch (operator) {
    case 'equals': {
      if (columnType === 'boolean') {
        // Handle boolean string comparisons
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
        // Handle invalid dates
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
      // Single value contains check
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

// Apply filters to rows
export function applyFilters(
  rows: GridRow[],
  filters: GridFilterConfig,
  columns: ColumnSchema[],
  getDisplayValue: (rowId: string, colId: string, base: CellValue, row?: GridRow) => CellValue
): GridRow[] {
  // Return all rows if no filters
  if (!filters || filters.conditions.length === 0) {
    return rows
  }

  // Build column type map
  const columnTypeMap = new Map<string, ColumnType>()
  columns.forEach(col => columnTypeMap.set(col.id, col.type))

  return rows.filter(row => {
    const results = filters.conditions.map(condition => {
      const baseValue = row[condition.columnId]
      const value = getDisplayValue(row.__rowId, condition.columnId, baseValue, row)
      const columnType = columnTypeMap.get(condition.columnId) || 'string'
      return evaluateCondition(value, condition, columnType)
    })

    // Combine results based on logic
    if (filters.logic === 'and') {
      return results.every(r => r)
    } else {
      return results.some(r => r)
    }
  })
}

// Get unique values from a column (for quick filter dropdown)
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

  // Sort values
  return values.sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b
    }
    return String(a).localeCompare(String(b))
  })
}

// Count unique values in a column (for enum detection)
export function countUniqueValues(
  rows: GridRow[],
  columnId: string,
  getDisplayValue: (rowId: string, colId: string, base: CellValue, row?: GridRow) => CellValue,
  maxCheck: number = ENUM_THRESHOLD + 1
): number {
  const seen = new Set<string>()

  for (const row of rows) {
    if (seen.size > maxCheck) break // Early exit if we exceed threshold
    
    const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
    if (!isEmpty(value)) {
      seen.add(String(value).toLowerCase())
    }
  }

  return seen.size
}

// Create an empty filter config
export function createEmptyFilterConfig(): GridFilterConfig {
  return {
    conditions: [],
    logic: 'and',
  }
}

// Create a new filter condition with smart defaults based on type
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

// Check if filters are active
export function hasActiveFilters(filters: GridFilterConfig | null | undefined): boolean {
  return !!filters && filters.conditions.length > 0
}

// Count active filters
export function countActiveFilters(filters: GridFilterConfig | null | undefined): number {
  return filters?.conditions.length ?? 0
}
