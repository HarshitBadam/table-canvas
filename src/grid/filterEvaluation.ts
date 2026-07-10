import type { CellValue, ColumnSchema, ColumnType, FilterCondition, ViewFilterConfig } from '@/types'
import type { GridRow } from './types'
import { formatDateForInput } from './dateFilterUtils'
import { isEmptyFilterValue } from './filterOperators'

function normalize(value: CellValue | undefined): string | number | boolean | null {
  if (isEmptyFilterValue(value)) return null
  return typeof value === 'string' ? value.toLowerCase() : value ?? null
}

function compareDate(cellValue: CellValue, filterValue: CellValue | undefined, comparison: (cell: Date, filter: Date) => boolean): boolean {
  if (!filterValue) return true
  const cellDate = new Date(String(cellValue))
  const filterDate = new Date(String(filterValue))
  return !Number.isNaN(cellDate.getTime()) && !Number.isNaN(filterDate.getTime()) && comparison(cellDate, filterDate)
}

function compareBoolean(cellValue: CellValue, filterValue: CellValue | undefined): boolean | undefined {
  const cell = String(cellValue).toLowerCase()
  const filter = String(filterValue).toLowerCase()
  const truthy = ['true', '1', 'yes']
  const falsy = ['false', '0', 'no']
  if (truthy.includes(filter)) return truthy.includes(cell)
  if (falsy.includes(filter)) return falsy.includes(cell)
}

export function evaluateCondition(cellValue: CellValue, condition: FilterCondition, columnType: ColumnType): boolean {
  const { operator, value: filterValue, value2 } = condition
  if (operator === 'is_null') return isEmptyFilterValue(cellValue)
  if (operator === 'is_not_null') return !isEmptyFilterValue(cellValue)
  if (isEmptyFilterValue(cellValue)) return false

  const normalizedCell = normalize(cellValue)
  const normalizedFilter = normalize(filterValue ?? null)
  const isDate = columnType === 'date' || columnType === 'datetime'
  const stringCompare = (comparison: (cell: string, filter: string) => boolean) =>
    comparison(String(cellValue).toLowerCase(), String(filterValue).toLowerCase())

  switch (operator) {
    case 'equals':
      if (columnType === 'boolean') return compareBoolean(cellValue, filterValue) ?? normalizedCell === normalizedFilter
      if (columnType === 'number' && typeof cellValue === 'number') return cellValue === Number(filterValue)
      if (isDate) return compareDate(cellValue, filterValue, (cell, filter) => formatDateForInput(cell) === formatDateForInput(filter))
      return normalizedCell === normalizedFilter
    case 'not_equals':
      if (columnType === 'boolean') {
        const result = compareBoolean(cellValue, filterValue)
        return result === undefined ? normalizedCell !== normalizedFilter : !result
      }
      return columnType === 'number' && typeof cellValue === 'number' ? cellValue !== Number(filterValue) : normalizedCell !== normalizedFilter
    case 'contains': {
      const filterText = String(filterValue)
      const values = filterText.split('|||').filter(Boolean)
      if (filterText.includes('|||')) return values.some(value => String(cellValue).toLowerCase() === value.toLowerCase())
      return typeof normalizedCell === 'string' && typeof normalizedFilter === 'string'
        ? normalizedCell.includes(normalizedFilter)
        : stringCompare((cell, filter) => cell.includes(filter))
    }
    case 'not_contains': return typeof normalizedCell === 'string' && typeof normalizedFilter === 'string'
      ? !normalizedCell.includes(normalizedFilter) : stringCompare((cell, filter) => !cell.includes(filter))
    case 'starts_with': return typeof normalizedCell === 'string' && typeof normalizedFilter === 'string'
      ? normalizedCell.startsWith(normalizedFilter) : stringCompare((cell, filter) => cell.startsWith(filter))
    case 'ends_with': return typeof normalizedCell === 'string' && typeof normalizedFilter === 'string'
      ? normalizedCell.endsWith(normalizedFilter) : stringCompare((cell, filter) => cell.endsWith(filter))
    case 'greater_than': return columnType === 'number' ? Number(cellValue) > Number(filterValue)
      : isDate ? compareDate(cellValue, filterValue, (cell, filter) => cell > filter) : String(cellValue) > String(filterValue)
    case 'less_than': return columnType === 'number' ? Number(cellValue) < Number(filterValue)
      : isDate ? compareDate(cellValue, filterValue, (cell, filter) => cell < filter) : String(cellValue) < String(filterValue)
    case 'greater_equal': return columnType === 'number' ? Number(cellValue) >= Number(filterValue)
      : isDate ? compareDate(cellValue, filterValue, (cell, filter) => cell >= filter) : String(cellValue) >= String(filterValue)
    case 'less_equal': return columnType === 'number' ? Number(cellValue) <= Number(filterValue)
      : isDate ? compareDate(cellValue, filterValue, (cell, filter) => cell <= filter) : String(cellValue) <= String(filterValue)
    case 'between': {
      if (value2 === undefined || !filterValue) return true
      if (columnType === 'number') return Number(cellValue) >= Number(filterValue) && Number(cellValue) <= Number(value2)
      if (!isDate) return String(cellValue) >= String(filterValue) && String(cellValue) <= String(value2)
      const endDate = new Date(String(value2))
      endDate.setHours(23, 59, 59, 999)
      return compareDate(cellValue, filterValue, (cell, start) => !Number.isNaN(endDate.getTime()) && cell >= start && cell <= endDate)
    }
    default: return true
  }
}

export function applyFilters(
  rows: GridRow[],
  filters: ViewFilterConfig,
  columns: ColumnSchema[],
  getDisplayValue: (rowId: string, columnId: string, base: CellValue, row?: GridRow) => CellValue,
): GridRow[] {
  if (!filters || filters.conditions.length === 0) return rows
  const columnTypes = new Map(columns.map(column => [column.id, column.type]))
  return rows.filter(row => {
    const matches = filters.conditions.map(condition =>
      evaluateCondition(getDisplayValue(row.__rowId, condition.columnId, row[condition.columnId], row), condition, columnTypes.get(condition.columnId) ?? 'string'),
    )
    return filters.logic === 'and' ? matches.every(Boolean) : matches.some(Boolean)
  })
}
