import type * as duckdb from '@duckdb/duckdb-wasm'
import type {
  LoadTableRequest,
  TableSlice,
  AggregationDef,
  AggregationResult,
  ProfileResult,
} from '../types'
import type { CellValue, ColumnProfile } from '@/types'
import {
  sanitizeTableName,
  mapTypeToDuckDB,
  formatValueWithType,
  computeCardinalityClass,
} from './sqlHelpers'

export async function loadTable(conn: duckdb.AsyncDuckDBConnection, request: LoadTableRequest): Promise<void> {
  const { tableId, data } = request
  const tableName = sanitizeTableName(tableId)

  await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)

  // Use human-readable column names so transforms can reference columns by display name
  const columnDefs = data.columns.map((name, i) => {
    const type = mapTypeToDuckDB(data.types[i])
    return `"${name}" ${type}`
  }).join(', ')

  await conn.query(`CREATE TABLE "${tableName}" (${columnDefs})`)

  if (data.rows.length > 0) {
    const batchSize = 1000
    for (let i = 0; i < data.rows.length; i += batchSize) {
      const batch = data.rows.slice(i, i + batchSize)
      const values = batch.map(row =>
        '(' + row.map((v, colIdx) => formatValueWithType(v, data.types[colIdx])).join(', ') + ')'
      ).join(', ')

      const columns = data.columns.map(name => `"${name}"`).join(', ')
      await conn.query(`INSERT INTO "${tableName}" (${columns}) VALUES ${values}`)
    }
  }
}

export async function getTableSchema(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string
): Promise<{ columnId: string; columnType: string }[]> {
  const schemaResult = await conn.query(`DESCRIBE "${tableName}"`)
  const schemaData = schemaResult.toArray()

  return schemaData.map((col: { column_name: string; column_type: string }) => ({
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
  const tableName = sanitizeTableName(tableId)

  const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
  const totalRows = Number(countResult.toArray()[0]?.cnt ?? 0)

  const result = await conn.query(`SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`)
  const rows = result.toArray().map(row => {
    const obj: Record<string, CellValue> = {}
    for (const key of Object.keys(row)) {
      obj[key] = row[key] as CellValue
    }
    return obj
  })

  return { tableId, offset, limit, rows, totalRows }
}

export async function getAggregation(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  aggDef: AggregationDef
): Promise<AggregationResult> {
  const tableName = sanitizeTableName(tableId)

  const aggClauses = aggDef.aggregations.map(agg => {
    const op = agg.operation.toUpperCase()
    const alias = agg.alias || `${agg.operation}_${agg.column}`
    if (op === 'COUNT_DISTINCT') {
      return `COUNT(DISTINCT "${agg.column}") AS "${alias}"`
    }
    return `${op}("${agg.column}") AS "${alias}"`
  }).join(', ')

  let sql: string
  if (aggDef.groupBy && aggDef.groupBy.length > 0) {
    const groupCols = aggDef.groupBy.map(c => `"${c}"`).join(', ')
    sql = `SELECT ${groupCols}, ${aggClauses} FROM "${tableName}" GROUP BY ${groupCols}`
  } else {
    sql = `SELECT ${aggClauses} FROM "${tableName}"`
  }

  const result = await conn.query(sql)
  const schema = result.schema
  const rows = result.toArray().map(row =>
    schema.fields.map(f => row[f.name] as CellValue)
  )

  return {
    columns: schema.fields.map(f => f.name),
    rows,
  }
}

export async function getProfile(
  conn: duckdb.AsyncDuckDBConnection,
  tableId: string,
  phase: 1 | 2
): Promise<ProfileResult> {
  const tableName = sanitizeTableName(tableId)

  const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
  const rowCount = Number(countResult.toArray()[0]?.cnt ?? 0)

  const schemaResult = await conn.query(`DESCRIBE "${tableName}"`)
  const schemaData = schemaResult.toArray()

  const columns: ColumnProfile[] = []

  for (const col of schemaData) {
    const colName = (col as { column_name: string }).column_name
    const colType = (col as { column_type: string }).column_type.toLowerCase()

    const statsResult = await conn.query(`
      SELECT 
        COUNT(*) - COUNT("${colName}") as missing_count,
        COUNT(DISTINCT "${colName}") as distinct_count
      FROM "${tableName}"
    `)
    const stats = statsResult.toArray()[0] as { missing_count: number; distinct_count: number }

    const missingCount = Number(stats.missing_count)
    const missingPercent = rowCount > 0 ? (missingCount / rowCount) * 100 : 0
    const distinctCount = Number(stats.distinct_count)
    const completeness = 100 - missingPercent
    const cardinalityClass = computeCardinalityClass(distinctCount, rowCount)

    const isKeyCandidate = cardinalityClass === 'unique' && missingPercent < 1

    const profile: ColumnProfile = {
      columnId: colName,
      missingCount,
      missingPercent,
      distinctCount,
      distinctCountExact: true,
      completeness,
      cardinalityClass,
      isKeyCandidate,
    }

    const topResult = await conn.query(`
      SELECT "${colName}" as value, COUNT(*) as count
      FROM "${tableName}"
      WHERE "${colName}" IS NOT NULL
      GROUP BY "${colName}"
      ORDER BY count DESC
      LIMIT 25
    `)
    profile.topValues = topResult.toArray().map(row => ({
      value: (row as { value: CellValue; count: number }).value,
      count: Number((row as { value: CellValue; count: number }).count),
    }))

    if (phase === 2) {
      const isNumeric = colType.includes('int') || colType.includes('float') || colType.includes('double') || colType.includes('decimal')
      const isString = colType.includes('varchar') || colType.includes('char') || colType.includes('text')

      if (isNumeric) {
        const numStatsResult = await conn.query(`
          SELECT 
            MIN("${colName}") as min_val,
            MAX("${colName}") as max_val,
            AVG("${colName}") as mean_val,
            MEDIAN("${colName}") as median_val,
            STDDEV_SAMP("${colName}") as stddev_val,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${colName}") as q1_val,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${colName}") as q3_val
          FROM "${tableName}"
          WHERE "${colName}" IS NOT NULL
        `)
        const numStats = numStatsResult.toArray()[0] as Record<string, unknown>

        const toNum = (v: unknown) => v != null ? Number(v) : undefined

        profile.min = toNum(numStats.min_val)
        profile.max = toNum(numStats.max_val)
        profile.mean = toNum(numStats.mean_val)
        profile.median = toNum(numStats.median_val)
        profile.stdDev = toNum(numStats.stddev_val)
        profile.q1 = toNum(numStats.q1_val)
        profile.q3 = toNum(numStats.q3_val)
        if (profile.q1 != null && profile.q3 != null) {
          profile.iqr = profile.q3 - profile.q1
        }

        if (numStats.min_val !== null && numStats.max_val !== null && numStats.min_val !== numStats.max_val) {
          try {
            const histResult = await conn.query(`
              WITH bounds AS (
                SELECT 
                  MIN("${colName}") as min_v,
                  MAX("${colName}") as max_v,
                  (MAX("${colName}") - MIN("${colName}")) / 10.0 as bucket_width
                FROM "${tableName}"
                WHERE "${colName}" IS NOT NULL
              ),
              bucketed AS (
                SELECT 
                  FLOOR(("${colName}" - bounds.min_v) / NULLIF(bounds.bucket_width, 0)) as bucket_idx,
                  bounds.min_v,
                  bounds.bucket_width
                FROM "${tableName}", bounds
                WHERE "${colName}" IS NOT NULL
              )
              SELECT 
                bucket_idx,
                COUNT(*) as cnt,
                MIN(min_v + bucket_idx * bucket_width) as bucket_start,
                MIN(min_v + (bucket_idx + 1) * bucket_width) as bucket_end
              FROM bucketed
              GROUP BY bucket_idx, min_v, bucket_width
              ORDER BY bucket_idx
              LIMIT 10
            `)
            profile.histogram = histResult.toArray().map(row => {
              const r = row as { bucket_idx: number; cnt: number; bucket_start: number; bucket_end: number }
              return {
                bucket: `${r.bucket_start?.toFixed(1) ?? '?'}-${r.bucket_end?.toFixed(1) ?? '?'}`,
                count: Number(r.cnt)
              }
            })
          } catch (error) {
            console.error('[tableOperations] Histogram generation failed for column:', colName, error)
            // Histogram generation can fail for edge-case data distributions
          }
        }
      }

      if (isString) {
        try {
          const strStatsResult = await conn.query(`
            SELECT 
              MIN(LENGTH("${colName}")) as min_len,
              MAX(LENGTH("${colName}")) as max_len,
              AVG(LENGTH("${colName}")) as avg_len
            FROM "${tableName}"
            WHERE "${colName}" IS NOT NULL
          `)
          const strStats = strStatsResult.toArray()[0] as { min_len: number; max_len: number; avg_len: number }

          profile.minLength = Number(strStats.min_len)
          profile.maxLength = Number(strStats.max_len)
          profile.avgLength = Number(strStats.avg_len)
        } catch (error) {
          console.error('[tableOperations] String length stats failed for column:', colName, error)
          // String stats can fail for certain column types
        }
      }

      const isDate = colType.includes('date') || colType.includes('timestamp')
      if (isDate) {
        try {
          // Cast to VARCHAR to get a parseable string format
          const dateStatsResult = await conn.query(`
            SELECT 
              CAST(MIN("${colName}") AS VARCHAR) as min_val,
              CAST(MAX("${colName}") AS VARCHAR) as max_val
            FROM "${tableName}"
            WHERE "${colName}" IS NOT NULL
          `)
          const dateStats = dateStatsResult.toArray()[0] as { min_val: string | null; max_val: string | null }

          if (dateStats.min_val) {
            const parsed = Date.parse(dateStats.min_val)
            if (!isNaN(parsed)) profile.min = parsed
          }
          if (dateStats.max_val) {
            const parsed = Date.parse(dateStats.max_val)
            if (!isNaN(parsed)) profile.max = parsed
          }
        } catch (e) {
          console.error('[Engine] Date stats error:', e)
        }
      }
    }

    columns.push(profile)
  }

  return {
    tableId,
    rowCount,
    columns,
    phase,
    computedAt: new Date().toISOString(),
  }
}

export async function dropTable(conn: duckdb.AsyncDuckDBConnection, tableId: string): Promise<void> {
  const tableName = sanitizeTableName(tableId)
  await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)
}
