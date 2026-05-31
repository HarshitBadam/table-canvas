import type { FormulaSuggestion } from './types'

export interface ColumnInfo {
  id: string
  name: string
  type: string
}

interface NamePattern {
  patterns: RegExp[]
  generator: (columnName: string, columns: ColumnInfo[]) => FormulaSuggestion | null
}

export function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[_\-\s]+/g, '_')
}

function findColumnsByKeywords(
  columns: ColumnInfo[],
  keywords: string[],
  preferredType?: string
): ColumnInfo[] {
  return columns.filter(col => {
    const normalizedName = normalizeColumnName(col.name)
    const matchesKeyword = keywords.some(kw => normalizedName.includes(kw))
    const matchesType = !preferredType || col.type === preferredType
    return matchesKeyword && matchesType
  })
}

function findColumn(
  columns: ColumnInfo[],
  keywords: string[],
  preferredType?: string
): ColumnInfo | null {
  const matches = findColumnsByKeywords(columns, keywords, preferredType)
  return matches.length > 0 ? matches[0] : null
}

function findNumericColumns(columns: ColumnInfo[]): ColumnInfo[] {
  return columns.filter(col => col.type === 'number')
}

export const namePatterns: NamePattern[] = [
  // Total patterns (multiplication)
  {
    patterns: [
      /^total[_\s]*(price|amount|revenue|sales|cost|value)$/i,
      /^(price|amount|revenue|sales|cost|value)[_\s]*total$/i,
      /^total$/i,
    ],
    generator: (_, columns) => {
      const priceCol = findColumn(columns, ['price', 'unit_price', 'rate', 'cost'], 'number')
      const qtyCol = findColumn(columns, ['quantity', 'qty', 'units', 'count', 'amount'], 'number')
      
      if (priceCol && qtyCol) {
        return {
          formula: `[${priceCol.name}] * [${qtyCol.name}]`,
          description: `Calculate total from ${priceCol.name} and ${qtyCol.name}`,
          confidence: 'high',
          basedOn: [priceCol.name, qtyCol.name],
        }
      }
      return null
    },
  },

  // Revenue/Sales total
  {
    patterns: [
      /^total[_\s]*(revenue|sales)$/i,
      /^(revenue|sales)[_\s]*total$/i,
    ],
    generator: (_, columns) => {
      const priceCol = findColumn(columns, ['price', 'unit_price', 'selling_price'], 'number')
      const qtyCol = findColumn(columns, ['quantity', 'qty', 'units_sold', 'sold'], 'number')
      
      if (priceCol && qtyCol) {
        return {
          formula: `[${priceCol.name}] * [${qtyCol.name}]`,
          description: `Calculate revenue from ${priceCol.name} and ${qtyCol.name}`,
          confidence: 'high',
          basedOn: [priceCol.name, qtyCol.name],
        }
      }
      return null
    },
  },

  // Post-tax / Net income patterns
  {
    patterns: [
      /^(post|after)[_\s]*tax[_\s]*(income|amount|price|value)?$/i,
      /^net[_\s]*(income|amount|price|value|pay|salary)?$/i,
    ],
    generator: (_, columns) => {
      const incomeCol = findColumn(columns, ['income', 'gross', 'salary', 'amount', 'price', 'revenue'], 'number')
      const taxCol = findColumn(columns, ['tax', 'tax_rate', 'taxes'], 'number')
      
      if (incomeCol && taxCol) {
        // Tax is likely a rate (0-1) or percentage (0-100) or absolute amount
        return {
          formula: `[${incomeCol.name}] * (1 - [${taxCol.name}])`,
          description: `Calculate post-tax amount (assuming tax rate as decimal)`,
          confidence: 'medium',
          basedOn: [incomeCol.name, taxCol.name],
        }
      }
      
      if (incomeCol) {
        return {
          formula: `[${incomeCol.name}] * 0.7`,
          description: `Estimate post-tax amount (assuming 30% tax rate)`,
          confidence: 'low',
          basedOn: [incomeCol.name],
        }
      }
      return null
    },
  },

  // Pre-tax / Gross income patterns
  {
    patterns: [
      /^(pre|before)[_\s]*tax[_\s]*(income|amount)?$/i,
      /^gross[_\s]*(income|amount|pay|salary)?$/i,
    ],
    generator: (_, columns) => {
      const netCol = findColumn(columns, ['net', 'post_tax', 'after_tax', 'take_home'], 'number')
      const taxCol = findColumn(columns, ['tax', 'tax_rate', 'taxes'], 'number')
      
      if (netCol && taxCol) {
        return {
          formula: `[${netCol.name}] / (1 - [${taxCol.name}])`,
          description: `Calculate pre-tax amount from net and tax rate`,
          confidence: 'medium',
          basedOn: [netCol.name, taxCol.name],
        }
      }
      return null
    },
  },

  // Per-unit / Rate patterns
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
        const numerator = perMatch[1]
        const denominator = perMatch[2]
        
        const numCol = findColumn(columns, [numerator], 'number')
        const denCol = findColumn(columns, [denominator], 'number')
        
        if (numCol && denCol) {
          return {
            formula: `[${numCol.name}] / [${denCol.name}]`,
            description: `Calculate ${numCol.name} per ${denCol.name}`,
            confidence: 'high',
            basedOn: [numCol.name, denCol.name],
          }
        }
      }
      
      if (normalized.includes('price_per_unit') || normalized.includes('unit_price')) {
        const totalCol = findColumn(columns, ['total', 'amount', 'price', 'cost'], 'number')
        const qtyCol = findColumn(columns, ['quantity', 'qty', 'units', 'count'], 'number')
        
        if (totalCol && qtyCol) {
          return {
            formula: `[${totalCol.name}] / [${qtyCol.name}]`,
            description: `Calculate unit price from total and quantity`,
            confidence: 'high',
            basedOn: [totalCol.name, qtyCol.name],
          }
        }
      }
      
      return null
    },
  },

  // Full name / Name concatenation
  {
    patterns: [
      /^full[_\s]*name$/i,
      /^display[_\s]*name$/i,
      /^complete[_\s]*name$/i,
      /^name$/i,
    ],
    generator: (_, columns) => {
      const firstNameCol = findColumn(columns, ['first_name', 'firstname', 'fname', 'given_name'], 'string')
      const lastNameCol = findColumn(columns, ['last_name', 'lastname', 'lname', 'surname', 'family_name'], 'string')
      
      if (firstNameCol && lastNameCol) {
        return {
          formula: `CONCAT([${firstNameCol.name}], " ", [${lastNameCol.name}])`,
          description: `Combine first and last name`,
          confidence: 'high',
          basedOn: [firstNameCol.name, lastNameCol.name],
        }
      }
      return null
    },
  },

  // Age group / Category patterns
  {
    patterns: [
      /^age[_\s]*(group|category|bracket|range)$/i,
      /^(.+)[_\s]*(group|category|bracket|tier)$/i,
    ],
    generator: (columnName, columns) => {
      const normalized = normalizeColumnName(columnName)
      
      if (normalized.includes('age')) {
        const ageCol = findColumn(columns, ['age', 'years', 'years_old'], 'number')
        
        if (ageCol) {
          return {
            formula: `IF([${ageCol.name}] < 18, "Child", IF([${ageCol.name}] < 65, "Adult", "Senior"))`,
            description: `Categorize by age: Child (<18), Adult (18-64), Senior (65+)`,
            confidence: 'high',
            basedOn: [ageCol.name],
          }
        }
      }
      
      if (normalized.includes('income')) {
        const incomeCol = findColumn(columns, ['income', 'salary', 'earnings', 'revenue'], 'number')
        
        if (incomeCol) {
          return {
            formula: `IF([${incomeCol.name}] < 30000, "Low", IF([${incomeCol.name}] < 100000, "Medium", "High"))`,
            description: `Categorize by income level`,
            confidence: 'medium',
            basedOn: [incomeCol.name],
          }
        }
      }
      
      return null
    },
  },

  // Margin / Profit margin patterns
  {
    patterns: [
      /^(profit|gross)?[_\s]*margin$/i,
      /^margin[_\s]*(percent|pct|%)?$/i,
    ],
    generator: (_, columns) => {
      const revenueCol = findColumn(columns, ['revenue', 'sales', 'income', 'price'], 'number')
      const costCol = findColumn(columns, ['cost', 'expense', 'cogs', 'expenses'], 'number')
      
      if (revenueCol && costCol) {
        return {
          formula: `([${revenueCol.name}] - [${costCol.name}]) / [${revenueCol.name}] * 100`,
          description: `Calculate profit margin percentage`,
          confidence: 'high',
          basedOn: [revenueCol.name, costCol.name],
        }
      }
      return null
    },
  },

  // Profit patterns
  {
    patterns: [
      /^(gross|net)?[_\s]*profit$/i,
      /^earnings$/i,
    ],
    generator: (_, columns) => {
      const revenueCol = findColumn(columns, ['revenue', 'sales', 'income', 'total'], 'number')
      const costCol = findColumn(columns, ['cost', 'expense', 'expenses', 'cogs'], 'number')
      
      if (revenueCol && costCol) {
        return {
          formula: `[${revenueCol.name}] - [${costCol.name}]`,
          description: `Calculate profit (revenue minus cost)`,
          confidence: 'high',
          basedOn: [revenueCol.name, costCol.name],
        }
      }
      return null
    },
  },

  // Difference / Change patterns
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
      
      if (numericCols.length >= 2) {
        return {
          formula: `[${numericCols[0].name}] - [${numericCols[1].name}]`,
          description: `Calculate difference between first two numeric columns`,
          confidence: 'low',
          basedOn: [numericCols[0].name, numericCols[1].name],
        }
      }
      
      return null
    },
  },

  // Percentage patterns
  {
    patterns: [
      /^(.+)[_\s]*(percent|pct|percentage|%)$/i,
      /^pct[_\s]*(.+)$/i,
      /^percent(age)?$/i,
      /^ratio$/i,
      /^share$/i,
    ],
    generator: (_columnName, columns) => {
      const numericCols = findNumericColumns(columns)
      
      if (numericCols.length >= 2) {
        const totalCol = findColumn(columns, ['total', 'sum', 'all', 'grand_total', 'revenue', 'amount'], 'number')
        const partCol = numericCols.find(c => c.id !== totalCol?.id)
        
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
      }
      
      return null
    },
  },

  // Tax amount
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
          description: `Calculate tax amount`,
          confidence: 'high',
          basedOn: [priceCol.name, taxRateCol.name],
        }
      }
      
      if (priceCol) {
        return {
          formula: `[${priceCol.name}] * 0.1`,
          description: `Calculate tax at 10% rate`,
          confidence: 'low',
          basedOn: [priceCol.name],
        }
      }
      
      return null
    },
  },

  // Discount patterns
  {
    patterns: [
      /^discount(ed)?[_\s]*(price|amount)?$/i,
      /^sale[_\s]*price$/i,
    ],
    generator: (_, columns) => {
      const priceCol = findColumn(columns, ['price', 'original_price', 'list_price', 'regular_price'], 'number')
      const discountCol = findColumn(columns, ['discount', 'discount_rate', 'discount_percent'], 'number')
      
      if (priceCol && discountCol) {
        return {
          formula: `[${priceCol.name}] * (1 - [${discountCol.name}])`,
          description: `Calculate discounted price`,
          confidence: 'high',
          basedOn: [priceCol.name, discountCol.name],
        }
      }
      
      return null
    },
  },

  // Address / Full address
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
      
      const parts: string[] = []
      if (streetCol) parts.push(`[${streetCol.name}]`)
      if (cityCol) parts.push(`[${cityCol.name}]`)
      if (stateCol) parts.push(`[${stateCol.name}]`)
      if (zipCol) parts.push(`[${zipCol.name}]`)
      
      if (parts.length >= 2) {
        return {
          formula: `CONCAT(${parts.join(', ", ", ')})`,
          description: `Combine address components`,
          confidence: 'high',
          basedOn: [streetCol, cityCol, stateCol, zipCol].filter(Boolean).map(c => c!.name),
        }
      }
      
      return null
    },
  },

  // Year extracted from date
  {
    patterns: [
      /^year$/i,
      /^fiscal[_\s]*year$/i,
    ],
    generator: (_, columns) => {
      const dateCol = columns.find(c => 
        c.type === 'date' || 
        c.type === 'datetime' ||
        normalizeColumnName(c.name).includes('date')
      )
      
      if (dateCol) {
        return {
          formula: `YEAR([${dateCol.name}])`,
          description: `Extract year from ${dateCol.name}`,
          confidence: 'high',
          basedOn: [dateCol.name],
        }
      }
      return null
    },
  },

  // Month extracted from date
  {
    patterns: [
      /^month$/i,
    ],
    generator: (_, columns) => {
      const dateCol = columns.find(c => 
        c.type === 'date' || 
        c.type === 'datetime' ||
        normalizeColumnName(c.name).includes('date')
      )
      
      if (dateCol) {
        return {
          formula: `MONTH([${dateCol.name}])`,
          description: `Extract month from ${dateCol.name}`,
          confidence: 'high',
          basedOn: [dateCol.name],
        }
      }
      return null
    },
  },

  // Is empty / Has value
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
      
      const targetCol = columns.find(c => 
        normalizeColumnName(c.name).includes('email') ||
        normalizeColumnName(c.name).includes('phone') ||
        normalizeColumnName(c.name).includes('address')
      ) || columns[0]
      
      if (targetCol) {
        if (isNullCheck) {
          return {
            formula: `ISNULL([${targetCol.name}])`,
            description: `Check if ${targetCol.name} is empty`,
            confidence: 'medium',
            basedOn: [targetCol.name],
          }
        } else {
          return {
            formula: `NOT(ISNULL([${targetCol.name}]))`,
            description: `Check if ${targetCol.name} has a value`,
            confidence: 'medium',
            basedOn: [targetCol.name],
          }
        }
      }
      return null
    },
  },
]
