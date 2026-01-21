/**
 * Web Worker entry point for DuckDB-WASM engine
 * All heavy data operations run here, off the main thread
 */

import * as duckdb from '@duckdb/duckdb-wasm'
import type { 
  WorkerRequest, 
  WorkerResponse,
  LoadTableRequest,
  TableSlice,
  AggregationDef,
  AggregationResult,
  ProfileResult,
  TransformResult,
} from '../types'
import type { TransformDef, CellValue, ColumnProfile } from '@/lib/types'

// DuckDB instance
let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

// Initialize DuckDB
async function initDuckDB(): Promise<void> {
  if (db) return

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  
  // Select a bundle based on browser checks
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)
  
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
  )
  
  // Instantiate the async version
  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)
  
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(worker_url)
  
  conn = await db.connect()
}

// Load table data into DuckDB
async function loadTable(request: LoadTableRequest): Promise<void> {
  if (!conn) throw new Error('DuckDB not initialized')
  
  const { tableId, data } = request
  const tableName = sanitizeTableName(tableId)
  
  // Drop existing table if exists
  await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)
  
  // Build CREATE TABLE statement
  const columnDefs = data.columnIds.map((id, i) => {
    const type = mapTypeToDuckDB(data.types[i])
    return `"${id}" ${type}`
  }).join(', ')
  
  await conn.query(`CREATE TABLE "${tableName}" (${columnDefs})`)
  
  // Insert data in batches
  if (data.rows.length > 0) {
    const batchSize = 1000
    for (let i = 0; i < data.rows.length; i += batchSize) {
      const batch = data.rows.slice(i, i + batchSize)
      const values = batch.map(row => 
        '(' + row.map(v => formatValue(v)).join(', ') + ')'
      ).join(', ')
      
      const columns = data.columnIds.map(id => `"${id}"`).join(', ')
      await conn.query(`INSERT INTO "${tableName}" (${columns}) VALUES ${values}`)
    }
  }
}

// Get table schema for building explicit column lists
async function getTableSchema(tableName: string): Promise<{ columnId: string; columnType: string }[]> {
  if (!conn) throw new Error('DuckDB not initialized')
  
  const schemaResult = await conn.query(`DESCRIBE "${tableName}"`)
  const schemaData = schemaResult.toArray()
  
  return schemaData.map((col: { column_name: string; column_type: string }) => ({
    columnId: col.column_name,
    columnType: col.column_type,
  }))
}

// Extract a clean, human-readable name from a column ID
// Converts "col_0_product_id" -> "Product ID", "col_3_order_date" -> "Order Date"
function getCleanColumnName(colId: string): string {
  // Remove common prefixes like "col_0_", "col_1_", etc.
  let name = colId.replace(/^col_\d+_/, '')
  
  // Also remove formula_ prefix
  name = name.replace(/^formula_\d+_/, '')
  
  // Remove trailing timestamp if present (like _1234567890)
  name = name.replace(/_\d{10,}$/, '')
  
  // Convert underscores to spaces and capitalize each word
  name = name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
  
  return name || colId
}

// Build explicit column selection for joins with proper naming
async function buildJoinColumnSelection(
  leftTable: string,
  rightTable: string,
  _leftKey: string,
  rightKey: string,
  leftColumns?: string[],
  rightColumns?: string[],
  columnPrefix: 'table_name' | 'left_right' | 'none' = 'none',
  leftTableName?: string,
  rightTableName?: string
): Promise<{ selectClause: string; columnNames: string[] }> {
  // Get schemas for both tables
  const leftSchema = await getTableSchema(leftTable)
  const rightSchema = await getTableSchema(rightTable)
  
  // Determine which columns to include from each table
  const leftColIds = leftColumns && leftColumns.length > 0
    ? leftColumns
    : leftSchema.map(c => c.columnId)
  
  // For right table, exclude the join key by default (it's redundant)
  const rightColIds = rightColumns && rightColumns.length > 0
    ? rightColumns.filter(c => c !== rightKey)
    : rightSchema.map(c => c.columnId).filter(c => c !== rightKey)
  
  // Build a map from colId to clean name for both tables
  const leftCleanNames = new Map<string, string>()
  const rightCleanNames = new Map<string, string>()
  
  for (const colId of leftColIds) {
    leftCleanNames.set(colId, getCleanColumnName(colId))
  }
  for (const colId of rightColIds) {
    rightCleanNames.set(colId, getCleanColumnName(colId))
  }
  
  // Track clean names to detect conflicts
  const leftNameSet = new Set([...leftCleanNames.values()])
  const rightNameSet = new Set([...rightCleanNames.values()])
  
  // Get friendly table prefixes
  const leftPrefix = leftTableName 
    ? leftTableName.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0]
    : 'Left'
  const rightPrefix = rightTableName 
    ? rightTableName.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0]
    : 'Right'
  
  // Build column selections with appropriate aliases
  const selectParts: string[] = []
  const columnNames: string[] = []
  
  // Add left table columns
  for (const colId of leftColIds) {
    const cleanName = leftCleanNames.get(colId) || colId
    let alias: string
    
    if (columnPrefix === 'table_name') {
      alias = `${leftPrefix} ${cleanName}`
    } else if (columnPrefix === 'left_right') {
      alias = `Left ${cleanName}`
    } else {
      // 'none' - only add prefix if there's a conflict
      alias = rightNameSet.has(cleanName) ? `${leftPrefix} ${cleanName}` : cleanName
    }
    
    selectParts.push(`l."${colId}" AS "${alias}"`)
    columnNames.push(alias)
  }
  
  // Add right table columns (excluding join key)
  for (const colId of rightColIds) {
    const cleanName = rightCleanNames.get(colId) || colId
    let alias: string
    
    if (columnPrefix === 'table_name') {
      alias = `${rightPrefix} ${cleanName}`
    } else if (columnPrefix === 'left_right') {
      alias = `Right ${cleanName}`
    } else {
      // 'none' - only add prefix if there's a conflict
      alias = leftNameSet.has(cleanName) ? `${rightPrefix} ${cleanName}` : cleanName
    }
    
    selectParts.push(`r."${colId}" AS "${alias}"`)
    columnNames.push(alias)
  }
  
  return {
    selectClause: selectParts.join(',\n    '),
    columnNames,
  }
}

// Execute a transform and create a new derived table
async function executeTransform(
  transformDef: TransformDef & { outputTableId: string }
): Promise<TransformResult> {
  if (!conn) throw new Error('DuckDB not initialized')
  
  const { outputTableId } = transformDef
  const outputTableName = sanitizeTableName(outputTableId)
  
  // Build SQL based on transform type
  let sql: string
  
  switch (transformDef.type) {
    case 'join': {
      const leftTable = sanitizeTableName(transformDef.leftTableId)
      const rightTable = sanitizeTableName(transformDef.rightTableId)
      const joinType = transformDef.joinType.toUpperCase()
      
      // Build explicit column selection for better naming and performance
      const { selectClause } = await buildJoinColumnSelection(
        leftTable,
        rightTable,
        transformDef.leftKey,
        transformDef.rightKey,
        transformDef.leftColumns,
        transformDef.rightColumns,
        transformDef.columnPrefix,
        transformDef.leftTableName,
        transformDef.rightTableName
      )
      
      sql = `
        CREATE TABLE "${outputTableName}" AS
        SELECT 
          ${selectClause}
        FROM "${leftTable}" AS l
        ${joinType} JOIN "${rightTable}" AS r
        ON l."${transformDef.leftKey}" = r."${transformDef.rightKey}"
      `
      break
    }
    
    case 'filter': {
      const sourceTable = sanitizeTableName(transformDef.sourceTableId)
      const conditions = transformDef.conditions.map(cond => {
        const col = `"${cond.columnId}"`
        const val = cond.value ?? null
        const val2 = cond.value2 ?? null
        switch (cond.operator) {
          case 'equals': return `${col} = ${formatValue(val)}`
          case 'not_equals': return `${col} != ${formatValue(val)}`
          case 'contains': return `${col} LIKE '%' || ${formatValue(val)} || '%'`
          case 'greater_than': return `${col} > ${formatValue(val)}`
          case 'less_than': return `${col} < ${formatValue(val)}`
          case 'greater_equal': return `${col} >= ${formatValue(val)}`
          case 'less_equal': return `${col} <= ${formatValue(val)}`
          case 'between': return `${col} BETWEEN ${formatValue(val)} AND ${formatValue(val2)}`
          case 'is_null': return `${col} IS NULL`
          case 'is_not_null': return `${col} IS NOT NULL`
          default: return '1=1'
        }
      })
      const whereClause = conditions.join(transformDef.logic === 'and' ? ' AND ' : ' OR ')
      
      sql = `CREATE TABLE "${outputTableName}" AS SELECT * FROM "${sourceTable}" WHERE ${whereClause}`
      break
    }
    
    case 'select': {
      const sourceTable = sanitizeTableName(transformDef.sourceTableId)
      const selectedCols = transformDef.columns
        .filter(c => c.include)
        .map(c => {
          if (c.newName && c.newName !== c.sourceColumnId) {
            return `"${c.sourceColumnId}" AS "${c.newName}"`
          }
          return `"${c.sourceColumnId}"`
        })
        .join(', ')
      
      sql = `CREATE TABLE "${outputTableName}" AS SELECT ${selectedCols || '*'} FROM "${sourceTable}"`
      break
    }
    
    case 'calculated_column': {
      const sourceTable = sanitizeTableName(transformDef.sourceTableId)
      // Note: In production, expression should be validated/parsed
      sql = `
        CREATE TABLE "${outputTableName}" AS
        SELECT *, (${transformDef.expression}) AS "${transformDef.newColumnName}"
        FROM "${sourceTable}"
      `
      break
    }
    
    case 'group_summarize': {
      const sourceTable = sanitizeTableName(transformDef.sourceTableId)
      const groupCols = transformDef.groupByColumns.map(c => `"${c}"`).join(', ')
      const aggs = transformDef.aggregations.map(agg => {
        const op = agg.operation.toUpperCase()
        if (op === 'COUNT_DISTINCT') {
          return `COUNT(DISTINCT "${agg.columnId}") AS "${agg.alias}"`
        }
        return `${op}("${agg.columnId}") AS "${agg.alias}"`
      }).join(', ')
      
      sql = `
        CREATE TABLE "${outputTableName}" AS
        SELECT ${groupCols}, ${aggs}
        FROM "${sourceTable}"
        GROUP BY ${groupCols}
      `
      break
    }
    
    case 'union': {
      const tables = transformDef.sourceTableIds.map(id => 
        `SELECT * FROM "${sanitizeTableName(id)}"`
      ).join(' UNION ALL ')
      
      sql = `CREATE TABLE "${outputTableName}" AS ${tables}`
      break
    }
    
    default:
      throw new Error(`Unknown transform type: ${(transformDef as TransformDef).type}`)
  }
  
  // Drop existing output table and execute transform
  await conn.query(`DROP TABLE IF EXISTS "${outputTableName}"`)
  await conn.query(sql)
  
  // Get schema and preview
  const schemaResult = await conn.query(`DESCRIBE "${outputTableName}"`)
  const schemaData = schemaResult.toArray()
  
  const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM "${outputTableName}"`)
  const rowCount = Number(countResult.toArray()[0]?.cnt ?? 0)
  
  const previewResult = await conn.query(`SELECT * FROM "${outputTableName}" LIMIT 20`)
  const preview = previewResult.toArray().map(row => {
    const obj: Record<string, CellValue> = {}
    for (const key of Object.keys(row)) {
      obj[key] = row[key] as CellValue
    }
    return obj
  })
  
  return {
    tableId: outputTableId,
    schema: {
      columns: schemaData.map((col: { column_name: string; column_type: string; null: string }) => ({
        id: col.column_name,
        name: col.column_name,
        type: mapDuckDBTypeToApp(col.column_type),
        nullable: col.null === 'YES',
      })),
      rowCount,
    },
    rowCount,
    preview,
  }
}

// Get a slice of data for grid display
async function getSlice(tableId: string, offset: number, limit: number): Promise<TableSlice> {
  if (!conn) throw new Error('DuckDB not initialized')
  
  const tableName = sanitizeTableName(tableId)
  
  // Get total count
  const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
  const totalRows = Number(countResult.toArray()[0]?.cnt ?? 0)
  
  // Get slice
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

// Get aggregation results
async function getAggregation(tableId: string, aggDef: AggregationDef): Promise<AggregationResult> {
  if (!conn) throw new Error('DuckDB not initialized')
  
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

// Compute cardinality class based on distinct ratio
function computeCardinalityClass(distinctCount: number, rowCount: number): 'unique' | 'high' | 'low' {
  if (rowCount === 0) return 'low'
  const ratio = distinctCount / rowCount
  if (ratio > 0.95) return 'unique'
  if (ratio > 0.5) return 'high'
  return 'low'
}

// Get profiling results for a table
async function getProfile(tableId: string, phase: 1 | 2): Promise<ProfileResult> {
  if (!conn) throw new Error('DuckDB not initialized')
  
  const tableName = sanitizeTableName(tableId)
  
  // Get row count
  const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
  const rowCount = Number(countResult.toArray()[0]?.cnt ?? 0)
  
  // Get schema
  const schemaResult = await conn.query(`DESCRIBE "${tableName}"`)
  const schemaData = schemaResult.toArray()
  
  const columns: ColumnProfile[] = []
  
  for (const col of schemaData) {
    const colName = (col as { column_name: string }).column_name
    const colType = (col as { column_type: string }).column_type.toLowerCase()
    
    // Phase 1: Basic stats
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
    
    // Determine if this could be a key column (high uniqueness, low nulls)
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
    
    // Get top values
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
    
    // Phase 2: Additional stats based on column type
    if (phase === 2) {
      const isNumeric = colType.includes('int') || colType.includes('float') || colType.includes('double') || colType.includes('decimal')
      const isString = colType.includes('varchar') || colType.includes('char') || colType.includes('text')
      
      if (isNumeric) {
        // Numeric stats: min, max, mean, median, stddev, quartiles
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
        
        // Convert all values with Number() to handle BigInt
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
        
        // Generate histogram for numeric columns
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
          } catch {
            // Histogram generation failed, skip it
          }
        }
      }
      
      if (isString) {
        // String stats: min/max/avg length
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
        } catch {
          // String stats failed, skip
        }
      }
      
      // Date/DateTime stats: min, max as epoch timestamps
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
          
          // Parse the date strings to epoch milliseconds
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

// Drop a table
async function dropTable(tableId: string): Promise<void> {
  if (!conn) throw new Error('DuckDB not initialized')
  
  const tableName = sanitizeTableName(tableId)
  await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)
}

// ============================================================================
// Helper Functions
// ============================================================================

function sanitizeTableName(tableId: string): string {
  return tableId.replace(/[^a-zA-Z0-9_]/g, '_')
}

function mapTypeToDuckDB(type: string): string {
  switch (type.toLowerCase()) {
    case 'number': return 'DOUBLE'
    case 'boolean': return 'BOOLEAN'
    case 'date': return 'DATE'
    case 'datetime': return 'TIMESTAMP'
    default: return 'VARCHAR'
  }
}

function mapDuckDBTypeToApp(duckType: string): 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'unknown' {
  const lower = duckType.toLowerCase()
  if (lower.includes('int') || lower.includes('float') || lower.includes('double') || lower.includes('decimal')) {
    return 'number'
  }
  if (lower.includes('bool')) return 'boolean'
  if (lower.includes('timestamp')) return 'datetime'
  if (lower.includes('date')) return 'date'
  if (lower.includes('varchar') || lower.includes('char') || lower.includes('text')) return 'string'
  return 'unknown'
}

function formatValue(value: CellValue): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  // Escape single quotes in strings
  return `'${String(value).replace(/'/g, "''")}'`
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data
  
  try {
    let result: unknown
    
    switch (type) {
      case 'init':
        await initDuckDB()
        result = { success: true }
        break
        
      case 'loadTable':
        await loadTable(payload as LoadTableRequest)
        result = { success: true }
        break
        
      case 'executeTransform':
        result = await executeTransform(payload as TransformDef & { outputTableId: string })
        break
        
      case 'getSlice': {
        const { tableId, offset, limit } = payload as { tableId: string; offset: number; limit: number }
        result = await getSlice(tableId, offset, limit)
        break
      }
        
      case 'getAggregation': {
        const { tableId, aggDef } = payload as { tableId: string; aggDef: AggregationDef }
        result = await getAggregation(tableId, aggDef)
        break
      }
        
      case 'getProfile': {
        const { tableId, phase } = payload as { tableId: string; phase: 1 | 2 }
        result = await getProfile(tableId, phase)
        break
      }
        
      case 'dropTable':
        await dropTable(payload as string)
        result = { success: true }
        break
        
      default:
        throw new Error(`Unknown request type: ${type}`)
    }
    
    const response: WorkerResponse = { id, success: true, data: result }
    self.postMessage(response)
    
  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}

// Signal that worker is ready
self.postMessage({ type: 'ready' })

