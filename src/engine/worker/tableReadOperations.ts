import type * as duckdb from '@duckdb/duckdb-wasm'
import type { AggregationDef, AggregationResult, TableSlice } from '../types'
import type { CellValue } from '@/types'
import { quoteIdentifier, sanitizeTableName } from './sqlHelpers'

function mapRows(result: Awaited<ReturnType<duckdb.AsyncDuckDBConnection['query']>>): Record<string, CellValue>[] {
  return result.toArray().map(row => {
    const mapped: Record<string, CellValue> = {}
    for (const key of Object.keys(row)) {
      mapped[key] = row[key] as CellValue
    }
    return mapped
  })
}

export async function getTableSchema(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string
): Promise<{ columnId: string; columnType: string }[]> {
  const schemaResult = await conn.query(`DESCRIBE ${quoteIdentifier(tableName)}`)
  return schemaResult.toArray().map((col: { column_name: string; column_type: string }) => ({
    columnId: col.column_name,
    columnType: col.column_type,
  }))
}

export async function getSlice(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  offset: number,
  limit: number
): Promise<TableSlice> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM ${tableName}`)
  const totalRows = Number(countResult.toArray()[0]?.cnt ?? 0)
  const result = await conn.query(`SELECT * FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`)

  return { tableId, offset, limit, rows: mapRows(result), totalRows }
}

export async function getAggregation(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  aggDef: AggregationDef
): Promise<AggregationResult> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const aggClauses = aggDef.aggregations.map(agg => {
    const operation = agg.operation.toUpperCase()
    const alias = quoteIdentifier(agg.alias || `${agg.operation}_${agg.column}`)
    const column = quoteIdentifier(agg.column)
    return operation === 'COUNT_DISTINCT'
      ? `COUNT(DISTINCT ${column}) AS ${alias}`
      : `${operation}(${column}) AS ${alias}`
  }).join(', ')
  const groupColumns = aggDef.groupBy?.map(quoteIdentifier).join(', ')
  const sql = groupColumns
    ? `SELECT ${groupColumns}, ${aggClauses} FROM ${tableName} GROUP BY ${groupColumns}`
    : `SELECT ${aggClauses} FROM ${tableName}`
  const result = await conn.query(sql)
  const schema = result.schema

  return {
    columns: schema.fields.map(field => field.name),
    rows: result.toArray().map(row => schema.fields.map(field => row[field.name] as CellValue)),
  }
}

export async function getDistinctValues(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  column: string,
  limit = 100
): Promise<CellValue[]> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const quotedColumn = quoteIdentifier(column)
  const result = await conn.query(
    `SELECT DISTINCT ${quotedColumn} AS val FROM ${tableName} WHERE ${quotedColumn} IS NOT NULL ORDER BY ${quotedColumn} LIMIT ${limit}`
  )
  return result.toArray().map(row => (row as { val: CellValue }).val)
}
