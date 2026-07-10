import type * as duckdb from '@duckdb/duckdb-wasm'
import type { ProfileResult } from '../types'
import type { CellValue, ColumnProfile } from '@/types'
import { computeCardinalityClass, quoteIdentifier, sanitizeTableName } from './sqlHelpers'
import { INTERNAL_ROW_ID_COLUMN } from '../internalColumns'

const isNumericType = (type: string) => /int|float|double|decimal/.test(type)
const isStringType = (type: string) => /varchar|char|text/.test(type)
const isDateType = (type: string) => /date|timestamp/.test(type)
const toNumberOrUndefined = (value: unknown) => value == null ? undefined : Number(value)

async function addNumericProfile(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string,
  column: string,
  profile: ColumnProfile
): Promise<void> {
  const stats = (await conn.query(`
    SELECT MIN(${column}) as min_val, MAX(${column}) as max_val, AVG(${column}) as mean_val,
      MEDIAN(${column}) as median_val, STDDEV_SAMP(${column}) as stddev_val,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${column}) as q1_val,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${column}) as q3_val
    FROM ${tableName} WHERE ${column} IS NOT NULL
  `)).toArray()[0] as Record<string, unknown>

  profile.min = toNumberOrUndefined(stats.min_val)
  profile.max = toNumberOrUndefined(stats.max_val)
  profile.mean = toNumberOrUndefined(stats.mean_val)
  profile.median = toNumberOrUndefined(stats.median_val)
  profile.stdDev = toNumberOrUndefined(stats.stddev_val)
  profile.q1 = toNumberOrUndefined(stats.q1_val)
  profile.q3 = toNumberOrUndefined(stats.q3_val)
  if (profile.q1 != null && profile.q3 != null) profile.iqr = profile.q3 - profile.q1

  if (stats.min_val === null || stats.max_val === null || stats.min_val === stats.max_val) return
  try {
    const histogram = await conn.query(`
      WITH bounds AS (
        SELECT MIN(${column}) as min_v, MAX(${column}) as max_v,
          (MAX(${column}) - MIN(${column})) / 10.0 as bucket_width
        FROM ${tableName} WHERE ${column} IS NOT NULL
      ), bucketed AS (
        SELECT FLOOR((${column} - bounds.min_v) / NULLIF(bounds.bucket_width, 0)) as bucket_idx,
          bounds.min_v, bounds.bucket_width
        FROM ${tableName}, bounds WHERE ${column} IS NOT NULL
      )
      SELECT bucket_idx, COUNT(*) as cnt, MIN(min_v + bucket_idx * bucket_width) as bucket_start,
        MIN(min_v + (bucket_idx + 1) * bucket_width) as bucket_end
      FROM bucketed GROUP BY bucket_idx, min_v, bucket_width ORDER BY bucket_idx LIMIT 10
    `)
    profile.histogram = histogram.toArray().map(row => {
      const bucket = row as { cnt: number; bucket_start: number; bucket_end: number }
      return {
        bucket: `${bucket.bucket_start?.toFixed(1) ?? '?'}-${bucket.bucket_end?.toFixed(1) ?? '?'}`,
        count: Number(bucket.cnt),
      }
    })
  } catch (error) {
    console.error('[tableOperations] Histogram generation failed for column:', column, error)
  }
}

async function addStringProfile(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string,
  column: string,
  profile: ColumnProfile
): Promise<void> {
  try {
    const stats = (await conn.query(`
      SELECT MIN(LENGTH(${column})) as min_len, MAX(LENGTH(${column})) as max_len,
        AVG(LENGTH(${column})) as avg_len
      FROM ${tableName} WHERE ${column} IS NOT NULL
    `)).toArray()[0] as { min_len: number; max_len: number; avg_len: number }
    profile.minLength = Number(stats.min_len)
    profile.maxLength = Number(stats.max_len)
    profile.avgLength = Number(stats.avg_len)
  } catch (error) {
    console.error('[tableOperations] String length stats failed for column:', column, error)
  }
}

async function addDateProfile(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string,
  column: string,
  profile: ColumnProfile
): Promise<void> {
  try {
    const stats = (await conn.query(`
      SELECT CAST(MIN(${column}) AS VARCHAR) as min_val, CAST(MAX(${column}) AS VARCHAR) as max_val
      FROM ${tableName} WHERE ${column} IS NOT NULL
    `)).toArray()[0] as { min_val: string | null; max_val: string | null }
    if (stats.min_val) {
      const value = Date.parse(stats.min_val)
      if (!isNaN(value)) profile.min = value
    }
    if (stats.max_val) {
      const value = Date.parse(stats.max_val)
      if (!isNaN(value)) profile.max = value
    }
  } catch (error) {
    console.error('[Engine] Date stats error:', error)
  }
}

export async function getProfile(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  phase: 1 | 2
): Promise<ProfileResult> {
  const tableName = quoteIdentifier(sanitizeTableName(tableId))
  const rowCount = Number((await conn.query(`SELECT COUNT(*) as cnt FROM ${tableName}`)).toArray()[0]?.cnt ?? 0)
  const schema = ((await conn.query(`DESCRIBE ${tableName}`)).toArray() as {
    column_name: string
    column_type: string
  }[]).filter((definition) => definition.column_name !== INTERNAL_ROW_ID_COLUMN)
  const columns: ColumnProfile[] = []

  for (const definition of schema) {
    const column = quoteIdentifier(definition.column_name)
    const type = definition.column_type.toLowerCase()
    const stats = (await conn.query(`
      SELECT COUNT(*) - COUNT(${column}) as missing_count, COUNT(DISTINCT ${column}) as distinct_count
      FROM ${tableName}
    `)).toArray()[0] as { missing_count: number; distinct_count: number }
    const missingCount = Number(stats.missing_count)
    const missingPercent = rowCount > 0 ? missingCount / rowCount * 100 : 0
    const distinctCount = Number(stats.distinct_count)
    const cardinalityClass = computeCardinalityClass(distinctCount, rowCount)
    const profile: ColumnProfile = {
      columnId: definition.column_name,
      missingCount,
      missingPercent,
      distinctCount,
      distinctCountExact: true,
      completeness: 100 - missingPercent,
      cardinalityClass,
      isKeyCandidate: cardinalityClass === 'unique' && missingPercent < 1,
    }
    const topValues = await conn.query(`
      SELECT ${column} as value, COUNT(*) as count FROM ${tableName} WHERE ${column} IS NOT NULL
      GROUP BY ${column} ORDER BY count DESC LIMIT 25
    `)
    profile.topValues = topValues.toArray().map(row => ({
      value: (row as { value: CellValue }).value,
      count: Number((row as { count: number }).count),
    }))

    if (phase === 2) {
      if (isNumericType(type)) await addNumericProfile(conn, tableName, column, profile)
      if (isStringType(type)) await addStringProfile(conn, tableName, column, profile)
      if (isDateType(type)) await addDateProfile(conn, tableName, column, profile)
    }
    columns.push(profile)
  }

  return { tableId, rowCount, columns, phase, computedAt: new Date().toISOString() }
}
