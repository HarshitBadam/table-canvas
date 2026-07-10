import type { NamePattern } from './suggestionPatternTypes'
import { findColumn, findNumericColumns } from './suggestionPatternTypes'

export const metricPatterns: NamePattern[] = [
  {
    patterns: [
      /^(profit|gross)?[_\s]*margin$/i,
      /^margin[_\s]*(percent|pct|%)?$/i,
    ],
    generator: (_, columns) => {
      const revenueCol = findColumn(columns, ['revenue', 'sales', 'income', 'price'], 'number')
      const costCol = findColumn(columns, ['cost', 'expense', 'cogs', 'expenses'], 'number')
      if (!revenueCol || !costCol) return null
      return {
        formula: `([${revenueCol.name}] - [${costCol.name}]) / [${revenueCol.name}] * 100`,
        description: 'Calculate profit margin percentage',
        confidence: 'high',
        basedOn: [revenueCol.name, costCol.name],
      }
    },
  },
  {
    patterns: [
      /^(gross|net)?[_\s]*profit$/i,
      /^earnings$/i,
    ],
    generator: (_, columns) => {
      const revenueCol = findColumn(columns, ['revenue', 'sales', 'income', 'total'], 'number')
      const costCol = findColumn(columns, ['cost', 'expense', 'expenses', 'cogs'], 'number')
      if (!revenueCol || !costCol) return null
      return {
        formula: `[${revenueCol.name}] - [${costCol.name}]`,
        description: 'Calculate profit (revenue minus cost)',
        confidence: 'high',
        basedOn: [revenueCol.name, costCol.name],
      }
    },
  },
  {
    patterns: [
      /^(.+)[_\s]*(diff|difference|change|delta)$/i,
      /^(diff|difference|change|delta)[_\s]*(.+)$/i,
    ],
    generator: (_, columns) => {
      const numericCols = findNumericColumns(columns)
      const beforeCol = findColumn(columns, ['before', 'old', 'previous', 'last', 'prior'], 'number')
      const afterCol = findColumn(columns, ['after', 'new', 'current', 'this', 'present'], 'number')
      if (beforeCol && afterCol) {
        return {
          formula: `[${afterCol.name}] - [${beforeCol.name}]`,
          description: `Calculate difference between ${afterCol.name} and ${beforeCol.name}`,
          confidence: 'high',
          basedOn: [afterCol.name, beforeCol.name],
        }
      }
      if (numericCols.length < 2) return null
      return {
        formula: `[${numericCols[0].name}] - [${numericCols[1].name}]`,
        description: 'Calculate difference between first two numeric columns',
        confidence: 'low',
        basedOn: [numericCols[0].name, numericCols[1].name],
      }
    },
  },
  {
    patterns: [
      /^(.+)[_\s]*(percent|pct|percentage|%)$/i,
      /^pct[_\s]*(.+)$/i,
      /^percent(age)?$/i,
      /^ratio$/i,
      /^share$/i,
    ],
    generator: (_, columns) => {
      const numericCols = findNumericColumns(columns)
      if (numericCols.length < 2) return null
      const totalCol = findColumn(columns, ['total', 'sum', 'all', 'grand_total', 'revenue', 'amount'], 'number')
      const partCol = numericCols.find(column => column.id !== totalCol?.id)
      if (totalCol && partCol) {
        return {
          formula: `[${partCol.name}] / [${totalCol.name}] * 100`,
          description: `Calculate ${partCol.name} as percentage of ${totalCol.name}`,
          confidence: 'medium',
          basedOn: [partCol.name, totalCol.name],
        }
      }
      return {
        formula: `[${numericCols[0].name}] / [${numericCols[1].name}] * 100`,
        description: `Calculate ${numericCols[0].name} as percentage of ${numericCols[1].name}`,
        confidence: 'low',
        basedOn: [numericCols[0].name, numericCols[1].name],
      }
    },
  },
  {
    patterns: [
      /^tax[_\s]*(amount|value)?$/i,
      /^sales[_\s]*tax$/i,
    ],
    generator: (_, columns) => {
      const priceCol = findColumn(columns, ['price', 'amount', 'subtotal', 'total'], 'number')
      const taxRateCol = findColumn(columns, ['tax_rate', 'rate'], 'number')
      if (priceCol && taxRateCol) {
        return {
          formula: `[${priceCol.name}] * [${taxRateCol.name}]`,
          description: 'Calculate tax amount',
          confidence: 'high',
          basedOn: [priceCol.name, taxRateCol.name],
        }
      }
      if (!priceCol) return null
      return {
        formula: `[${priceCol.name}] * 0.1`,
        description: 'Calculate tax at 10% rate',
        confidence: 'low',
        basedOn: [priceCol.name],
      }
    },
  },
  {
    patterns: [
      /^discount(ed)?[_\s]*(price|amount)?$/i,
      /^sale[_\s]*price$/i,
    ],
    generator: (_, columns) => {
      const priceCol = findColumn(columns, ['price', 'original_price', 'list_price', 'regular_price'], 'number')
      const discountCol = findColumn(columns, ['discount', 'discount_rate', 'discount_percent'], 'number')
      if (!priceCol || !discountCol) return null
      return {
        formula: `[${priceCol.name}] * (1 - [${discountCol.name}])`,
        description: 'Calculate discounted price',
        confidence: 'high',
        basedOn: [priceCol.name, discountCol.name],
      }
    },
  },
]
