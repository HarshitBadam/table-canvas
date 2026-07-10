import type { NamePattern } from './suggestionPatternTypes'
import { findColumn, normalizeColumnName } from './suggestionPatternTypes'

export const financialPatterns: NamePattern[] = [
  {
    patterns: [
      /^total[_\s]*(price|amount|revenue|sales|cost|value)$/i,
      /^(price|amount|revenue|sales|cost|value)[_\s]*total$/i,
      /^total$/i,
    ],
    generator: (_, columns) => {
      const priceCol = findColumn(columns, ['price', 'unit_price', 'rate', 'cost'], 'number')
      const qtyCol = findColumn(columns, ['quantity', 'qty', 'units', 'count', 'amount'], 'number')
      if (!priceCol || !qtyCol) return null
      return {
        formula: `[${priceCol.name}] * [${qtyCol.name}]`,
        description: `Calculate total from ${priceCol.name} and ${qtyCol.name}`,
        confidence: 'high',
        basedOn: [priceCol.name, qtyCol.name],
      }
    },
  },
  {
    patterns: [
      /^total[_\s]*(revenue|sales)$/i,
      /^(revenue|sales)[_\s]*total$/i,
    ],
    generator: (_, columns) => {
      const priceCol = findColumn(columns, ['price', 'unit_price', 'selling_price'], 'number')
      const qtyCol = findColumn(columns, ['quantity', 'qty', 'units_sold', 'sold'], 'number')
      if (!priceCol || !qtyCol) return null
      return {
        formula: `[${priceCol.name}] * [${qtyCol.name}]`,
        description: `Calculate revenue from ${priceCol.name} and ${qtyCol.name}`,
        confidence: 'high',
        basedOn: [priceCol.name, qtyCol.name],
      }
    },
  },
  {
    patterns: [
      /^(post|after)[_\s]*tax[_\s]*(income|amount|price|value)?$/i,
      /^net[_\s]*(income|amount|price|value|pay|salary)?$/i,
    ],
    generator: (_, columns) => {
      const incomeCol = findColumn(columns, ['income', 'gross', 'salary', 'amount', 'price', 'revenue'], 'number')
      const taxCol = findColumn(columns, ['tax', 'tax_rate', 'taxes'], 'number')
      if (incomeCol && taxCol) {
        return {
          formula: `[${incomeCol.name}] * (1 - [${taxCol.name}])`,
          description: 'Calculate post-tax amount (assuming tax rate as decimal)',
          confidence: 'medium',
          basedOn: [incomeCol.name, taxCol.name],
        }
      }
      if (!incomeCol) return null
      return {
        formula: `[${incomeCol.name}] * 0.7`,
        description: 'Estimate post-tax amount (assuming 30% tax rate)',
        confidence: 'low',
        basedOn: [incomeCol.name],
      }
    },
  },
  {
    patterns: [
      /^(pre|before)[_\s]*tax[_\s]*(income|amount)?$/i,
      /^gross[_\s]*(income|amount|pay|salary)?$/i,
    ],
    generator: (_, columns) => {
      const netCol = findColumn(columns, ['net', 'post_tax', 'after_tax', 'take_home'], 'number')
      const taxCol = findColumn(columns, ['tax', 'tax_rate', 'taxes'], 'number')
      if (!netCol || !taxCol) return null
      return {
        formula: `[${netCol.name}] / (1 - [${taxCol.name}])`,
        description: 'Calculate pre-tax amount from net and tax rate',
        confidence: 'medium',
        basedOn: [netCol.name, taxCol.name],
      }
    },
  },
  {
    patterns: [
      /^(.+)[_\s]*per[_\s]*(.+)$/i,
      /^(.+)[_\s]*rate$/i,
      /^avg[_\s]*(.+)$/i,
      /^average[_\s]*(.+)$/i,
    ],
    generator: (columnName, columns) => {
      const normalized = normalizeColumnName(columnName)
      const perMatch = normalized.match(/(.+)_per_(.+)/)
      if (perMatch) {
        const numerator = findColumn(columns, [perMatch[1]], 'number')
        const denominator = findColumn(columns, [perMatch[2]], 'number')
        if (numerator && denominator) {
          return {
            formula: `[${numerator.name}] / [${denominator.name}]`,
            description: `Calculate ${numerator.name} per ${denominator.name}`,
            confidence: 'high',
            basedOn: [numerator.name, denominator.name],
          }
        }
      }
      if (normalized.includes('price_per_unit') || normalized.includes('unit_price')) {
        const totalCol = findColumn(columns, ['total', 'amount', 'price', 'cost'], 'number')
        const qtyCol = findColumn(columns, ['quantity', 'qty', 'units', 'count'], 'number')
        if (totalCol && qtyCol) {
          return {
            formula: `[${totalCol.name}] / [${qtyCol.name}]`,
            description: 'Calculate unit price from total and quantity',
            confidence: 'high',
            basedOn: [totalCol.name, qtyCol.name],
          }
        }
      }
      return null
    },
  },
]
