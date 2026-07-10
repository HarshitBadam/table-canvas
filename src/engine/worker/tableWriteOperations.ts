import type * as duckdb from '@duckdb/duckdb-wasm'
import type { LoadTableRequest } from '../types'
import type { CellValue } from '@/types'
import {
  formatValue,
  formatValueWithType,
  mapTypeToDuckDB,
  quoteIdentifier,
  sanitizeTableName,
} from './sqlHelpers'
import { INTERNAL_ROW_ID_COLUMN } from '../internalColumns'

export async function loadTable(conn: duckdb.AsyncDuckDBConnection, request: LoadTableRequest): Promise<void> {
  const { tableId, data } = request
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const columnDefinitions = data.columns
    .map((name, index) => `${quoteIdentifier(name)} ${mapTypeToDuckDB(data.types[index])}`)
    .join(', ')

  await conn.query(`DROP TABLE IF EXISTS ${tableName}`)
  await conn.query(`CREATE TABLE ${tableName} (${columnDefinitions})`)

  for (let index = 0; index < data.rows.length; index += 1000) {
    const batch = data.rows.slice(index, index + 1000)
    const values = batch.map(row =>
      `(${row.map((value, columnIndex) => formatValueWithType(value, data.types[columnIndex])).join(', ')})`
    ).join(', ')
    const columns = data.columns.map(quoteIdentifier).join(', ')
    await conn.query(`INSERT INTO ${tableName} (${columns}) VALUES ${values}`)
  }
}

export async function dropTable(conn: duckdb.AsyncDuckDBConnection, tableId: string): Promise<void> {
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(sanitizeTableName(tableId))}`)
}

export async function updateCell(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  rowId: string,
  column: string,
  value: CellValue,
  columnType?: string
): Promise<void> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const formattedValue = columnType ? formatValueWithType(value, columnType) : formatValue(value)
  await conn.query(
    `UPDATE ${tableName}
     SET ${quoteIdentifier(column)} = ${formattedValue}
     WHERE ${quoteIdentifier(INTERNAL_ROW_ID_COLUMN)} = ${formatValue(rowId)}`
  )
}

export async function insertRow(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  values: Record<string, CellValue>,
  columns: string[],
  types: string[]
): Promise<void> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const columnNames = columns.map(quoteIdentifier).join(', ')
  const formattedValues = columns.map((column, index) =>
    formatValueWithType(values[column] ?? null, types[index])
  ).join(', ')
  await conn.query(`INSERT INTO ${tableName} (${columnNames}) VALUES (${formattedValues})`)
}

export async function deleteRow(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  rowIndex: number
): Promise<void> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  await conn.query(
    `DELETE FROM ${tableName} WHERE rowid = (
      SELECT rowid FROM ${tableName} LIMIT 1 OFFSET ${rowIndex}
    )`
  )
}
