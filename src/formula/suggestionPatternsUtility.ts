import type { NamePattern } from './suggestionPatternTypes'
import { findColumn, normalizeColumnName } from './suggestionPatternTypes'

export const utilityPatterns: NamePattern[] = [
  {
    patterns: [
      /^full[_\s]*address$/i,
      /^complete[_\s]*address$/i,
      /^mailing[_\s]*address$/i,
    ],
    generator: (_, columns) => {
      const streetCol = findColumn(columns, ['street', 'address', 'street_address', 'address_line'], 'string')
      const cityCol = findColumn(columns, ['city', 'town'], 'string')
      const stateCol = findColumn(columns, ['state', 'province', 'region'], 'string')
      const zipCol = findColumn(columns, ['zip', 'postal', 'zip_code', 'postal_code'], 'string')
      const parts = [streetCol, cityCol, stateCol, zipCol].filter(column => column !== null)
      if (parts.length < 2) return null
      return {
        formula: `CONCAT(${parts.map(column => `[${column.name}]`).join(', ", ", ')})`,
        description: 'Combine address components',
        confidence: 'high',
        basedOn: parts.map(column => column.name),
      }
    },
  },
  {
    patterns: [
      /^year$/i,
      /^fiscal[_\s]*year$/i,
    ],
    generator: (_, columns) => {
      const dateCol = columns.find(column =>
        column.type === 'date' ||
        column.type === 'datetime' ||
        normalizeColumnName(column.name).includes('date'),
      )
      if (!dateCol) return null
      return {
        formula: `YEAR([${dateCol.name}])`,
        description: `Extract year from ${dateCol.name}`,
        confidence: 'high',
        basedOn: [dateCol.name],
      }
    },
  },
  {
    patterns: [/^month$/i],
    generator: (_, columns) => {
      const dateCol = columns.find(column =>
        column.type === 'date' ||
        column.type === 'datetime' ||
        normalizeColumnName(column.name).includes('date'),
      )
      if (!dateCol) return null
      return {
        formula: `MONTH([${dateCol.name}])`,
        description: `Extract month from ${dateCol.name}`,
        confidence: 'high',
        basedOn: [dateCol.name],
      }
    },
  },
  {
    patterns: [
      /^is[_\s]*empty$/i,
      /^has[_\s]*value$/i,
      /^is[_\s]*null$/i,
      /^is[_\s]*missing$/i,
    ],
    generator: (columnName, columns) => {
      const normalized = normalizeColumnName(columnName)
      const isNullCheck = normalized.includes('empty') || normalized.includes('null') || normalized.includes('missing')
      const targetCol = columns.find(column => {
        const name = normalizeColumnName(column.name)
        return name.includes('email') || name.includes('phone') || name.includes('address')
      }) ?? columns[0]
      if (!targetCol) return null
      return {
        formula: isNullCheck ? `ISNULL([${targetCol.name}])` : `NOT(ISNULL([${targetCol.name}]))`,
        description: isNullCheck ? `Check if ${targetCol.name} is empty` : `Check if ${targetCol.name} has a value`,
        confidence: 'medium',
        basedOn: [targetCol.name],
      }
    },
  },
]
