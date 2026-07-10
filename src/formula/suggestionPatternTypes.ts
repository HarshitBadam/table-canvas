import type { FormulaSuggestion } from './types'

export interface ColumnInfo {
  id: string
  name: string
  type: string
}

export interface NamePattern {
  patterns: RegExp[]
  generator: (columnName: string, columns: ColumnInfo[]) => FormulaSuggestion | null
}

export function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[_\-\s]+/g, '_')
}

export function findColumn(
  columns: ColumnInfo[],
  keywords: string[],
  preferredType?: string,
): ColumnInfo | null {
  return columns.find(column => {
    const matchesKeyword = keywords.some(keyword => normalizeColumnName(column.name).includes(keyword))
    return matchesKeyword && (!preferredType || column.type === preferredType)
  }) ?? null
}

export function findNumericColumns(columns: ColumnInfo[]): ColumnInfo[] {
  return columns.filter(column => column.type === 'number')
}
