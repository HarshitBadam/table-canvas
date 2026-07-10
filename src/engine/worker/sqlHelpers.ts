import type { CellValue, ColumnType } from '@/types'

export function sanitizeTableName(tableId: string): string {
  return tableId.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

export function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function mapTypeToDuckDB(type: string): string {
  switch (type.toLowerCase()) {
    case 'number': return 'DOUBLE'
    case 'boolean': return 'BOOLEAN'
    case 'date': return 'DATE'
    case 'datetime': return 'TIMESTAMP'
    default: return 'VARCHAR'
  }
}

export function mapDuckDBTypeToApp(duckType: string): ColumnType {
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

export function formatValue(value: CellValue): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  return escapeLiteral(String(value))
}

export function formatValueWithType(value: CellValue, columnType: string): string {
  if (value === null || value === undefined) return 'NULL'

  if (value === '' || (typeof value === 'string' && value.trim() === '')) {
    if (columnType === 'number' || columnType === 'boolean' || columnType === 'date' || columnType === 'datetime') {
      return 'NULL'
    }
    return "''"
  }

  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)

  if (columnType === 'number') {
    const num = parseFloat(String(value))
    if (!isNaN(num)) return String(num)
    return 'NULL'
  }

  if (columnType === 'boolean') {
    const lower = String(value).toLowerCase()
    if (lower === 'true' || lower === '1' || lower === 'yes') return 'TRUE'
    if (lower === 'false' || lower === '0' || lower === 'no') return 'FALSE'
    return 'NULL'
  }

  if (columnType === 'date' || columnType === 'datetime') {
    if (typeof value === 'object' && value !== null && 'getTime' in value) {
      const dateValue = value as unknown as Date
      if (isNaN(dateValue.getTime())) return 'NULL'
      if (columnType === 'datetime') {
        return escapeLiteral(dateValue.toISOString())
      }
      return escapeLiteral(dateValue.toISOString().split('T')[0])
    }

    const dateStr = String(value)
    const parsed = new Date(dateStr)
    if (!isNaN(parsed.getTime())) {
      if (columnType === 'datetime') {
        return escapeLiteral(parsed.toISOString())
      }
      return escapeLiteral(parsed.toISOString().split('T')[0])
    }

    return 'NULL'
  }

  return escapeLiteral(String(value))
}

export function getCleanColumnName(colId: string): string {
  let name = colId.replace(/^col_\d+_/, '')
  name = name.replace(/^formula_\d+_/, '')
  name = name.replace(/_\d{10,}$/, '')

  name = name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

  return name || colId
}

export function computeCardinalityClass(distinctCount: number, rowCount: number): 'unique' | 'high' | 'low' {
  if (rowCount === 0) return 'low'
  const ratio = distinctCount / rowCount
  if (ratio > 0.95) return 'unique'
  if (ratio > 0.5) return 'high'
  return 'low'
}
