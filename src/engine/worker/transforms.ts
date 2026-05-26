import type * as duckdb from '@duckdb/duckdb-wasm'
import type { TransformResult } from '../types'
import type { TransformDef, CellValue } from '@/types'
import { sanitizeTableName, formatValue, mapDuckDBTypeToApp, getCleanColumnName } from './sqlHelpers'
import { getTableSchema } from './tableOperations'

async function buildJoinColumnSelection(
  conn: duckdb.AsyncDuckDBConnection,
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
  const leftSchema = await getTableSchema(conn, leftTable)
  const rightSchema = await getTableSchema(conn, rightTable)

  const leftColIds = leftColumns && leftColumns.length > 0
    ? leftColumns
    : leftSchema.map(c => c.columnId)

  // Exclude the join key from right table (it's redundant)
  const rightColIds = rightColumns && rightColumns.length > 0
    ? rightColumns.filter(c => c !== rightKey)
    : rightSchema.map(c => c.columnId).filter(c => c !== rightKey)

  const leftCleanNames = new Map<string, string>()
  const rightCleanNames = new Map<string, string>()

  for (const colId of leftColIds) {
    leftCleanNames.set(colId, getCleanColumnName(colId))
  }
  for (const colId of rightColIds) {
    rightCleanNames.set(colId, getCleanColumnName(colId))
  }

  const leftNameSet = new Set([...leftCleanNames.values()])
  const rightNameSet = new Set([...rightCleanNames.values()])

  const leftPrefix = leftTableName
    ? leftTableName.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0]
    : 'Left'
  const rightPrefix = rightTableName
    ? rightTableName.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0]
    : 'Right'

  const selectParts: string[] = []
  const columnNames: string[] = []

  for (const colId of leftColIds) {
    const cleanName = leftCleanNames.get(colId) || colId
    let alias: string

    if (columnPrefix === 'table_name') {
      alias = `${leftPrefix} ${cleanName}`
    } else if (columnPrefix === 'left_right') {
      alias = `Left ${cleanName}`
    } else {
      alias = rightNameSet.has(cleanName) ? `${leftPrefix} ${cleanName}` : cleanName
    }

    selectParts.push(`l."${colId}" AS "${alias}"`)
    columnNames.push(alias)
  }

  for (const colId of rightColIds) {
    const cleanName = rightCleanNames.get(colId) || colId
    let alias: string

    if (columnPrefix === 'table_name') {
      alias = `${rightPrefix} ${cleanName}`
    } else if (columnPrefix === 'left_right') {
      alias = `Right ${cleanName}`
    } else {
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

export async function executeTransform(
  conn: duckdb.AsyncDuckDBConnection,
  transformDef: TransformDef & { outputTableId: string; columnIdToName?: Record<string, string> }
): Promise<TransformResult> {
  const { outputTableId, columnIdToName = {} } = transformDef
  const outputTableName = sanitizeTableName(outputTableId)

  const toColName = (colId: string): string => {
    return columnIdToName[colId] || colId
  }

  let sql: string

  switch (transformDef.type) {
    case 'join': {
      const leftTable = sanitizeTableName(transformDef.leftTableId)
      const rightTable = sanitizeTableName(transformDef.rightTableId)
      const joinType = transformDef.joinType.toUpperCase()

      const leftKey = toColName(transformDef.leftKey)
      const rightKey = toColName(transformDef.rightKey)

      const { selectClause } = await buildJoinColumnSelection(
        conn,
        leftTable,
        rightTable,
        leftKey,
        rightKey,
        transformDef.leftColumns?.map(toColName),
        transformDef.rightColumns?.map(toColName),
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
        ON l."${leftKey}" = r."${rightKey}"
      `
      break
    }

    case 'filter': {
      const sourceTable = sanitizeTableName(transformDef.sourceTableId)
      const conditions = transformDef.conditions.map(cond => {
        const col = `"${toColName(cond.columnId)}"`
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
          const colName = toColName(c.sourceColumnId)
          if (c.newName && c.newName !== c.sourceColumnId) {
            return `"${colName}" AS "${c.newName}"`
          }
          return `"${colName}"`
        })
        .join(', ')

      sql = `CREATE TABLE "${outputTableName}" AS SELECT ${selectedCols || '*'} FROM "${sourceTable}"`
      break
    }

    case 'calculated_column': {
      const sourceTable = sanitizeTableName(transformDef.sourceTableId)
      // Replace quoted column IDs like "col_3_actual" with their display names like "Actual"
      let expression = transformDef.expression
      for (const [colId, colName] of Object.entries(columnIdToName)) {
        const quotedIdPattern = new RegExp(`"${colId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')
        expression = expression.replace(quotedIdPattern, `"${colName}"`)
      }
      sql = `
        CREATE TABLE "${outputTableName}" AS
        SELECT *, (${expression}) AS "${transformDef.newColumnName}"
        FROM "${sourceTable}"
      `
      break
    }

    case 'group_summarize': {
      const sourceTable = sanitizeTableName(transformDef.sourceTableId)
      const groupCols = transformDef.groupByColumns.map(c => `"${toColName(c)}"`).join(', ')
      const aggs = transformDef.aggregations.map(agg => {
        const op = agg.operation.toUpperCase()
        const colName = toColName(agg.columnId)
        if (op === 'COUNT_DISTINCT') {
          return `COUNT(DISTINCT "${colName}") AS "${agg.alias}"`
        }
        return `${op}("${colName}") AS "${agg.alias}"`
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

  await conn.query(`DROP TABLE IF EXISTS "${outputTableName}"`)
  await conn.query(sql)

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
