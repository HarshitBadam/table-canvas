import type * as duckdb from '@duckdb/duckdb-wasm'
import type { FilterConditionDef, SortDef, TableSlice } from '../types'
import type { CellValue } from '@/types'
import { escapeLiteral, quoteIdentifier, sanitizeTableName } from './sqlHelpers'
import { INTERNAL_ROW_ID_COLUMN } from '../internalColumns'

function isMissingFilterValue(value: unknown): boolean {
  return value === null
    || value === undefined
    || (typeof value === 'string' && value.trim() === '')
}

function buildFilterClause(filter: FilterConditionDef): string | null {
  const column = quoteIdentifier(filter.column)
  const dateValue = (operator: string, value: unknown) =>
    `${column} ${operator} TRY_CAST(${escapeLiteral(String(value))} AS DATE)`

  if (filter.operator === 'between') {
    if (isMissingFilterValue(filter.value) || isMissingFilterValue(filter.value2)) return null
  } else if (
    filter.operator !== 'is_null'
    && filter.operator !== 'is_not_null'
    && isMissingFilterValue(filter.value)
  ) {
    return null
  }

  switch (filter.operator) {
    case 'is_null': return `${column} IS NULL OR CAST(${column} AS VARCHAR) = ''`
    case 'is_not_null': return `${column} IS NOT NULL AND CAST(${column} AS VARCHAR) != ''`
    case 'equals':
      if (filter.columnType === 'boolean') {
        return `${column} = ${['true', '1', 'yes'].includes(String(filter.value).toLowerCase()) ? 'TRUE' : 'FALSE'}`
      }
      if (filter.columnType === 'number') {
        const value = Number(filter.value)
        return Number.isFinite(value) ? `${column} = ${value}` : null
      }
      if (filter.columnType === 'date' || filter.columnType === 'datetime') return dateValue('=', filter.value)
      return `LOWER(CAST(${column} AS VARCHAR)) = ${escapeLiteral(String(filter.value ?? '').toLowerCase())}`
    case 'not_equals':
      if (filter.columnType === 'number') {
        const value = Number(filter.value)
        return Number.isFinite(value) ? `${column} != ${value}` : null
      }
      return `LOWER(CAST(${column} AS VARCHAR)) != ${escapeLiteral(String(filter.value ?? '').toLowerCase())}`
    case 'contains': {
      const value = String(filter.value ?? '')
      if (value.includes('|||')) {
        return `(${value.split('|||').filter(Boolean).map(item =>
          `LOWER(CAST(${column} AS VARCHAR)) = ${escapeLiteral(item.toLowerCase())}`
        ).join(' OR ')})`
      }
      return `LOWER(CAST(${column} AS VARCHAR)) LIKE '%' || ${escapeLiteral(value.toLowerCase())} || '%'`
    }
    case 'not_contains':
      return `LOWER(CAST(${column} AS VARCHAR)) NOT LIKE '%' || ${escapeLiteral(String(filter.value ?? '').toLowerCase())} || '%'`
    case 'starts_with':
      return `LOWER(CAST(${column} AS VARCHAR)) LIKE ${escapeLiteral(String(filter.value ?? '').toLowerCase())} || '%'`
    case 'ends_with':
      return `LOWER(CAST(${column} AS VARCHAR)) LIKE '%' || ${escapeLiteral(String(filter.value ?? '').toLowerCase())}`
    case 'greater_than':
      if (filter.columnType === 'date' || filter.columnType === 'datetime') return dateValue('>', filter.value)
      return Number.isFinite(Number(filter.value)) ? `${column} > ${Number(filter.value)}` : null
    case 'less_than':
      if (filter.columnType === 'date' || filter.columnType === 'datetime') return dateValue('<', filter.value)
      return Number.isFinite(Number(filter.value)) ? `${column} < ${Number(filter.value)}` : null
    case 'greater_equal':
      if (filter.columnType === 'date' || filter.columnType === 'datetime') return dateValue('>=', filter.value)
      return Number.isFinite(Number(filter.value)) ? `${column} >= ${Number(filter.value)}` : null
    case 'less_equal':
      if (filter.columnType === 'date' || filter.columnType === 'datetime') return dateValue('<=', filter.value)
      return Number.isFinite(Number(filter.value)) ? `${column} <= ${Number(filter.value)}` : null
    case 'between':
      if (filter.columnType === 'date' || filter.columnType === 'datetime') {
        return `${dateValue('>=', filter.value)} AND ${dateValue('<=', filter.value2)}`
      }
      if (!Number.isFinite(Number(filter.value)) || !Number.isFinite(Number(filter.value2))) return null
      return `${column} >= ${Number(filter.value)} AND ${column} <= ${Number(filter.value2)}`
    default: return null
  }
}

export async function getFilteredSlice(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  filters: FilterConditionDef[] | undefined,
  sorts: SortDef[] | undefined,
  search: string | undefined,
  offset: number,
  limit: number
): Promise<TableSlice> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const clauses = filters?.map(buildFilterClause).filter((clause): clause is string => !!clause) ?? []

  if (search?.trim()) {
    const schema = await conn.query(`DESCRIBE ${tableName}`)
    const term = escapeLiteral(search.trim().toLowerCase())
    const searchClauses = schema.toArray()
      .filter((column: { column_name: string }) => column.column_name !== INTERNAL_ROW_ID_COLUMN)
      .map((column: { column_name: string }) =>
        `LOWER(CAST(${quoteIdentifier(column.column_name)} AS VARCHAR)) LIKE '%' || ${term} || '%'`
      )
    if (searchClauses.length) clauses.push(`(${searchClauses.join(' OR ')})`)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const order = sorts?.length
    ? `ORDER BY ${sorts.map(sort => `${quoteIdentifier(sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`
    : ''
  const totalRows = Number((await conn.query(`SELECT COUNT(*) as cnt FROM ${tableName} ${where}`)).toArray()[0]?.cnt ?? 0)
  const result = await conn.query(`SELECT * FROM ${tableName} ${where} ${order} LIMIT ${limit} OFFSET ${offset}`)
  const rows = result.toArray().map(row => {
    const mapped: Record<string, CellValue> = {}
    for (const key of Object.keys(row)) mapped[key] = row[key] as CellValue
    return mapped
  })

  return { tableId, offset, limit, rows, totalRows }
}
