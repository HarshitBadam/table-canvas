import { generateId } from '@/lib/utils'
import type { CellValue, ColumnSchema, TableSchema } from '@/types'
import type { TableRow } from '@/state/dataStore'

const SNAPSHOT_VERSION = 1

/** JSON cannot represent NaN/±Infinity; encode them as tagged objects in the snapshot file. */
interface SpecialNumber {
  $number: 'NaN' | 'Infinity' | '-Infinity'
}

type SnapshotValue = CellValue | SpecialNumber

interface SnapshotPayload {
  version: typeof SNAPSHOT_VERSION
  columnIds: string[]
  rows: SnapshotValue[][]
}

export interface TableSnapshot {
  schema: TableSchema
  bytes: Uint8Array
}

export function createTableSnapshot(
  schema: TableSchema,
  rows: TableRow[],
): TableSnapshot {
  const columns = createSnapshotColumns(schema.columns)
  const payload: SnapshotPayload = {
    version: SNAPSHOT_VERSION,
    columnIds: columns.map(column => column.id),
    rows: rows.map(row => schema.columns.map(column => snapshotValue(row, column))),
  }
  return {
    schema: { columns, rowCount: rows.length },
    bytes: new TextEncoder().encode(JSON.stringify(payload)),
  }
}

export function parseTableSnapshot(
  fileData: ArrayBuffer,
  schema?: TableSchema,
): TableRow[] {
  if (!schema) throw new Error('Snapshot table schema is missing')

  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8').decode(fileData))
  } catch {
    throw new Error('Snapshot file is not valid JSON')
  }
  if (!isSnapshotPayload(value)) {
    throw new Error('Snapshot file has an invalid or unsupported format')
  }

  const expectedIds = schema.columns.map(column => column.id)
  if (
    value.columnIds.length !== expectedIds.length
    || value.columnIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new Error('Snapshot columns do not match the table schema')
  }

  return value.rows.map((values, rowIndex) => {
    if (values.length !== expectedIds.length) {
      throw new Error(`Snapshot row ${rowIndex + 1} has an invalid column count`)
    }
    return {
      __rowId: `row_${rowIndex}`,
      ...Object.fromEntries(expectedIds.map(
        (id, index) => [id, restoreSnapshotValue(values[index])],
      )),
    }
  })
}

function createSnapshotColumns(columns: ColumnSchema[]): ColumnSchema[] {
  const names = new Set<string>()
  return columns.map((column, index) => ({
    id: `snapshot_${index + 1}_${generateId()}`,
    name: uniqueColumnName(column.name || `Column ${index + 1}`, names),
    type: column.type,
    nullable: column.nullable,
    semanticHints: column.semanticHints ? [...column.semanticHints] : undefined,
  }))
}

function uniqueColumnName(candidate: string, names: Set<string>): string {
  const base = candidate.trim() || 'Column'
  let name = base
  let suffix = 2
  while (names.has(name.toLocaleLowerCase())) {
    name = `${base} (${suffix})`
    suffix += 1
  }
  names.add(name.toLocaleLowerCase())
  return name
}

function snapshotValue(row: TableRow, column: ColumnSchema): SnapshotValue {
  for (const key of [column.duckDbName, column.id, column.name]) {
    if (key && Object.prototype.hasOwnProperty.call(row, key)) {
      return normalizeCellValue(row[key])
    }
  }
  return null
}

function normalizeCellValue(value: unknown): SnapshotValue {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $number: 'NaN' }
    if (value === Number.POSITIVE_INFINITY) return { $number: 'Infinity' }
    if (value === Number.NEGATIVE_INFINITY) return { $number: '-Infinity' }
    return value
  }
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function restoreSnapshotValue(value: SnapshotValue): CellValue {
  if (!isSpecialNumber(value)) return value
  if (value.$number === 'NaN') return Number.NaN
  return value.$number === 'Infinity'
    ? Number.POSITIVE_INFINITY
    : Number.NEGATIVE_INFINITY
}

function isSnapshotPayload(value: unknown): value is SnapshotPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<SnapshotPayload>
  return payload.version === SNAPSHOT_VERSION
    && Array.isArray(payload.columnIds)
    && payload.columnIds.every(id => typeof id === 'string')
    && new Set(payload.columnIds).size === payload.columnIds.length
    && Array.isArray(payload.rows)
    && payload.rows.every(row =>
      Array.isArray(row) && row.every(isSnapshotValue),
    )
}

function isSnapshotValue(value: unknown): value is SnapshotValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || isSpecialNumber(value)
}

function isSpecialNumber(value: unknown): value is SpecialNumber {
  return Boolean(
    value
    && typeof value === 'object'
    && '$number' in value
    && ['NaN', 'Infinity', '-Infinity'].includes(
      String((value as SpecialNumber).$number),
    ),
  )
}
