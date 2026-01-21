/**
 * Built-in Functions
 * Implementation of formula functions
 */

import { FormulaValue, EvaluationContext, FunctionDefinition, FunctionCategory } from './types'

// ============================================================================
// Function Registry
// ============================================================================

export const builtInFunctions: Record<string, FunctionDefinition> = {}

function registerFunction(def: FunctionDefinition): void {
  builtInFunctions[def.name] = def
}

// ============================================================================
// Math Functions
// ============================================================================

registerFunction({
  name: 'SUM',
  category: 'math',
  description: 'Adds all numbers',
  syntax: 'SUM(number1, [number2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['SUM([price], [tax])', 'SUM(1, 2, 3)'],
  evaluate: (args) => {
    let sum = 0
    for (const arg of args) {
      if (arg !== null && typeof arg === 'number') {
        sum += arg
      }
    }
    return sum
  },
})

registerFunction({
  name: 'AVG',
  category: 'math',
  description: 'Returns the average of numbers',
  syntax: 'AVG(number1, [number2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['AVG([score1], [score2], [score3])'],
  evaluate: (args) => {
    let sum = 0
    let count = 0
    for (const arg of args) {
      if (arg !== null && typeof arg === 'number') {
        sum += arg
        count++
      }
    }
    return count > 0 ? sum / count : null
  },
})

registerFunction({
  name: 'MIN',
  category: 'math',
  description: 'Returns the smallest number',
  syntax: 'MIN(number1, [number2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['MIN([price1], [price2])'],
  evaluate: (args) => {
    const numbers = args.filter((a): a is number => typeof a === 'number')
    return numbers.length > 0 ? Math.min(...numbers) : null
  },
})

registerFunction({
  name: 'MAX',
  category: 'math',
  description: 'Returns the largest number',
  syntax: 'MAX(number1, [number2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['MAX([score1], [score2])'],
  evaluate: (args) => {
    const numbers = args.filter((a): a is number => typeof a === 'number')
    return numbers.length > 0 ? Math.max(...numbers) : null
  },
})

registerFunction({
  name: 'COUNT',
  category: 'math',
  description: 'Counts non-empty values',
  syntax: 'COUNT(value1, [value2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['COUNT([col1], [col2])'],
  evaluate: (args) => {
    return args.filter(a => a !== null && a !== undefined && a !== '').length
  },
})

registerFunction({
  name: 'ROUND',
  category: 'math',
  description: 'Rounds a number to specified decimal places',
  syntax: 'ROUND(number, [decimals])',
  minArgs: 1,
  maxArgs: 2,
  examples: ['ROUND([price], 2)', 'ROUND(3.14159, 2)'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const num = Number(args[0])
    const decimals = args[1] !== undefined ? Number(args[1]) : 0
    const factor = Math.pow(10, decimals)
    return Math.round(num * factor) / factor
  },
})

registerFunction({
  name: 'ABS',
  category: 'math',
  description: 'Returns the absolute value',
  syntax: 'ABS(number)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['ABS([difference])', 'ABS(-5)'],
  evaluate: (args) => {
    if (args[0] === null) return null
    return Math.abs(Number(args[0]))
  },
})

registerFunction({
  name: 'FLOOR',
  category: 'math',
  description: 'Rounds down to the nearest integer',
  syntax: 'FLOOR(number)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['FLOOR([price])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    return Math.floor(Number(args[0]))
  },
})

registerFunction({
  name: 'CEIL',
  category: 'math',
  description: 'Rounds up to the nearest integer',
  syntax: 'CEIL(number)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['CEIL([price])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    return Math.ceil(Number(args[0]))
  },
})

registerFunction({
  name: 'POWER',
  category: 'math',
  description: 'Returns base raised to power',
  syntax: 'POWER(base, exponent)',
  minArgs: 2,
  maxArgs: 2,
  examples: ['POWER(2, 3)', 'POWER([base], 2)'],
  evaluate: (args) => {
    if (args[0] === null || args[1] === null) return null
    return Math.pow(Number(args[0]), Number(args[1]))
  },
})

registerFunction({
  name: 'SQRT',
  category: 'math',
  description: 'Returns the square root',
  syntax: 'SQRT(number)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['SQRT(16)', 'SQRT([area])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const num = Number(args[0])
    if (num < 0) return null
    return Math.sqrt(num)
  },
})

registerFunction({
  name: 'MOD',
  category: 'math',
  description: 'Returns the remainder of division',
  syntax: 'MOD(number, divisor)',
  minArgs: 2,
  maxArgs: 2,
  examples: ['MOD(10, 3)', 'MOD([value], 2)'],
  evaluate: (args) => {
    if (args[0] === null || args[1] === null) return null
    const divisor = Number(args[1])
    if (divisor === 0) return null
    return Number(args[0]) % divisor
  },
})

// ============================================================================
// Text Functions
// ============================================================================

registerFunction({
  name: 'CONCAT',
  category: 'text',
  description: 'Joins text strings together',
  syntax: 'CONCAT(text1, [text2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['CONCAT([first_name], " ", [last_name])'],
  evaluate: (args) => {
    return args.map(a => a === null ? '' : String(a)).join('')
  },
})

registerFunction({
  name: 'UPPER',
  category: 'text',
  description: 'Converts text to uppercase',
  syntax: 'UPPER(text)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['UPPER([name])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    return String(args[0]).toUpperCase()
  },
})

registerFunction({
  name: 'LOWER',
  category: 'text',
  description: 'Converts text to lowercase',
  syntax: 'LOWER(text)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['LOWER([email])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    return String(args[0]).toLowerCase()
  },
})

registerFunction({
  name: 'TRIM',
  category: 'text',
  description: 'Removes leading and trailing spaces',
  syntax: 'TRIM(text)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['TRIM([name])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    return String(args[0]).trim()
  },
})

registerFunction({
  name: 'LEFT',
  category: 'text',
  description: 'Returns characters from the start of text',
  syntax: 'LEFT(text, num_chars)',
  minArgs: 2,
  maxArgs: 2,
  examples: ['LEFT([code], 3)'],
  evaluate: (args) => {
    if (args[0] === null) return null
    return String(args[0]).slice(0, Number(args[1]))
  },
})

registerFunction({
  name: 'RIGHT',
  category: 'text',
  description: 'Returns characters from the end of text',
  syntax: 'RIGHT(text, num_chars)',
  minArgs: 2,
  maxArgs: 2,
  examples: ['RIGHT([code], 4)'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const str = String(args[0])
    const count = Number(args[1])
    return str.slice(Math.max(0, str.length - count))
  },
})

registerFunction({
  name: 'MID',
  category: 'text',
  description: 'Returns characters from the middle of text',
  syntax: 'MID(text, start, num_chars)',
  minArgs: 3,
  maxArgs: 3,
  examples: ['MID([phone], 4, 3)'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const str = String(args[0])
    const start = Number(args[1]) - 1 // 1-based index
    const count = Number(args[2])
    return str.slice(start, start + count)
  },
})

registerFunction({
  name: 'LEN',
  category: 'text',
  description: 'Returns the length of text',
  syntax: 'LEN(text)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['LEN([description])'],
  evaluate: (args) => {
    if (args[0] === null) return 0
    return String(args[0]).length
  },
})

registerFunction({
  name: 'FIND',
  category: 'text',
  description: 'Finds the position of text within another text',
  syntax: 'FIND(find_text, within_text, [start])',
  minArgs: 2,
  maxArgs: 3,
  examples: ['FIND("@", [email])'],
  evaluate: (args) => {
    if (args[0] === null || args[1] === null) return null
    const findText = String(args[0])
    const withinText = String(args[1])
    const start = args[2] !== undefined ? Number(args[2]) - 1 : 0
    const pos = withinText.indexOf(findText, start)
    return pos >= 0 ? pos + 1 : null // Return 1-based index
  },
})

registerFunction({
  name: 'REPLACE',
  category: 'text',
  description: 'Replaces part of a text string with another text',
  syntax: 'REPLACE(text, start, num_chars, new_text)',
  minArgs: 4,
  maxArgs: 4,
  examples: ['REPLACE([phone], 1, 3, "XXX")'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const str = String(args[0])
    const start = Number(args[1]) - 1
    const count = Number(args[2])
    const newText = String(args[3])
    return str.slice(0, start) + newText + str.slice(start + count)
  },
})

registerFunction({
  name: 'SUBSTITUTE',
  category: 'text',
  description: 'Substitutes new text for old text in a string',
  syntax: 'SUBSTITUTE(text, old_text, new_text, [instance])',
  minArgs: 3,
  maxArgs: 4,
  examples: ['SUBSTITUTE([text], "old", "new")'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const str = String(args[0])
    const oldText = String(args[1])
    const newText = String(args[2])
    const instance = args[3] !== undefined ? Number(args[3]) : 0
    
    if (instance === 0) {
      // Replace all occurrences
      return str.split(oldText).join(newText)
    }
    
    // Replace specific instance
    let count = 0
    let result = ''
    let lastIndex = 0
    let index = str.indexOf(oldText)
    
    while (index !== -1) {
      count++
      if (count === instance) {
        result += str.slice(lastIndex, index) + newText
        lastIndex = index + oldText.length
        break
      }
      lastIndex = index + oldText.length
      index = str.indexOf(oldText, lastIndex)
    }
    
    result += str.slice(lastIndex)
    return result
  },
})

registerFunction({
  name: 'TEXT',
  category: 'text',
  description: 'Converts a value to text',
  syntax: 'TEXT(value)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['TEXT([number])'],
  evaluate: (args) => {
    if (args[0] === null) return ''
    return String(args[0])
  },
})

// ============================================================================
// Logic Functions
// ============================================================================

registerFunction({
  name: 'AND',
  category: 'logic',
  description: 'Returns TRUE if all arguments are true',
  syntax: 'AND(logical1, [logical2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['AND([age] > 18, [active] = TRUE)'],
  evaluate: (args) => {
    return args.every(a => Boolean(a))
  },
})

registerFunction({
  name: 'OR',
  category: 'logic',
  description: 'Returns TRUE if any argument is true',
  syntax: 'OR(logical1, [logical2], ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['OR([status] = "Active", [status] = "Pending")'],
  evaluate: (args) => {
    return args.some(a => Boolean(a))
  },
})

registerFunction({
  name: 'NOT',
  category: 'logic',
  description: 'Reverses the logic of its argument',
  syntax: 'NOT(logical)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['NOT([active])'],
  evaluate: (args) => {
    return !Boolean(args[0])
  },
})

registerFunction({
  name: 'ISNULL',
  category: 'logic',
  description: 'Returns TRUE if the value is null or empty',
  syntax: 'ISNULL(value)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['ISNULL([email])'],
  evaluate: (args) => {
    return args[0] === null || args[0] === undefined || args[0] === ''
  },
})

registerFunction({
  name: 'IFNULL',
  category: 'logic',
  description: 'Returns the first value if not null, otherwise the second',
  syntax: 'IFNULL(value, value_if_null)',
  minArgs: 2,
  maxArgs: 2,
  examples: ['IFNULL([discount], 0)'],
  evaluate: (args) => {
    const value = args[0]
    if (value === null || value === undefined || value === '') {
      return args[1]
    }
    return value
  },
})

registerFunction({
  name: 'COALESCE',
  category: 'logic',
  description: 'Returns the first non-null value',
  syntax: 'COALESCE(value1, value2, ...)',
  minArgs: 1,
  maxArgs: 100,
  examples: ['COALESCE([phone], [mobile], "N/A")'],
  evaluate: (args) => {
    for (const arg of args) {
      if (arg !== null && arg !== undefined && arg !== '') {
        return arg
      }
    }
    return null
  },
})

// ============================================================================
// Date Functions
// ============================================================================

registerFunction({
  name: 'NOW',
  category: 'date',
  description: 'Returns the current date and time',
  syntax: 'NOW()',
  minArgs: 0,
  maxArgs: 0,
  examples: ['NOW()'],
  evaluate: () => new Date(),
})

registerFunction({
  name: 'TODAY',
  category: 'date',
  description: 'Returns the current date',
  syntax: 'TODAY()',
  minArgs: 0,
  maxArgs: 0,
  examples: ['TODAY()'],
  evaluate: () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  },
})

registerFunction({
  name: 'YEAR',
  category: 'date',
  description: 'Returns the year from a date',
  syntax: 'YEAR(date)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['YEAR([date])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const date = args[0] instanceof Date ? args[0] : new Date(String(args[0]))
    return isNaN(date.getTime()) ? null : date.getFullYear()
  },
})

registerFunction({
  name: 'MONTH',
  category: 'date',
  description: 'Returns the month from a date (1-12)',
  syntax: 'MONTH(date)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['MONTH([date])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const date = args[0] instanceof Date ? args[0] : new Date(String(args[0]))
    return isNaN(date.getTime()) ? null : date.getMonth() + 1
  },
})

registerFunction({
  name: 'DAY',
  category: 'date',
  description: 'Returns the day from a date (1-31)',
  syntax: 'DAY(date)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['DAY([date])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const date = args[0] instanceof Date ? args[0] : new Date(String(args[0]))
    return isNaN(date.getTime()) ? null : date.getDate()
  },
})

registerFunction({
  name: 'HOUR',
  category: 'date',
  description: 'Returns the hour from a datetime (0-23)',
  syntax: 'HOUR(datetime)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['HOUR([timestamp])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const date = args[0] instanceof Date ? args[0] : new Date(String(args[0]))
    return isNaN(date.getTime()) ? null : date.getHours()
  },
})

registerFunction({
  name: 'MINUTE',
  category: 'date',
  description: 'Returns the minute from a datetime (0-59)',
  syntax: 'MINUTE(datetime)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['MINUTE([timestamp])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const date = args[0] instanceof Date ? args[0] : new Date(String(args[0]))
    return isNaN(date.getTime()) ? null : date.getMinutes()
  },
})

registerFunction({
  name: 'SECOND',
  category: 'date',
  description: 'Returns the second from a datetime (0-59)',
  syntax: 'SECOND(datetime)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['SECOND([timestamp])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const date = args[0] instanceof Date ? args[0] : new Date(String(args[0]))
    return isNaN(date.getTime()) ? null : date.getSeconds()
  },
})

registerFunction({
  name: 'DATE',
  category: 'date',
  description: 'Creates a date from year, month, day',
  syntax: 'DATE(year, month, day)',
  minArgs: 3,
  maxArgs: 3,
  examples: ['DATE(2024, 1, 15)'],
  evaluate: (args) => {
    if (args[0] === null || args[1] === null || args[2] === null) return null
    return new Date(Number(args[0]), Number(args[1]) - 1, Number(args[2]))
  },
})

registerFunction({
  name: 'DATEDIFF',
  category: 'date',
  description: 'Returns the difference between two dates in days',
  syntax: 'DATEDIFF(date1, date2)',
  minArgs: 2,
  maxArgs: 2,
  examples: ['DATEDIFF([end_date], [start_date])'],
  evaluate: (args) => {
    if (args[0] === null || args[1] === null) return null
    const date1 = args[0] instanceof Date ? args[0] : new Date(String(args[0]))
    const date2 = args[1] instanceof Date ? args[1] : new Date(String(args[1]))
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return null
    const diffTime = date1.getTime() - date2.getTime()
    return Math.floor(diffTime / (1000 * 60 * 60 * 24))
  },
})

// ============================================================================
// Type Conversion Functions
// ============================================================================

registerFunction({
  name: 'NUMBER',
  category: 'math',
  description: 'Converts a value to a number',
  syntax: 'NUMBER(value)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['NUMBER([price_text])'],
  evaluate: (args) => {
    if (args[0] === null) return null
    const num = Number(String(args[0]).replace(/[,$%\s]/g, ''))
    return isNaN(num) ? null : num
  },
})

registerFunction({
  name: 'BOOLEAN',
  category: 'logic',
  description: 'Converts a value to a boolean',
  syntax: 'BOOLEAN(value)',
  minArgs: 1,
  maxArgs: 1,
  examples: ['BOOLEAN([flag])'],
  evaluate: (args) => {
    if (args[0] === null) return false
    const val = args[0]
    if (typeof val === 'boolean') return val
    if (typeof val === 'number') return val !== 0
    const str = String(val).toLowerCase().trim()
    return str === 'true' || str === 'yes' || str === '1'
  },
})

// ============================================================================
// Helper Function
// ============================================================================

export function executeFunction(
  name: string,
  args: FormulaValue[],
  context: EvaluationContext
): FormulaValue {
  const func = builtInFunctions[name.toUpperCase()]
  if (!func) {
    throw new Error(`Unknown function: ${name}`)
  }
  return func.evaluate(args, context)
}

// ============================================================================
// Get Functions by Category
// ============================================================================

export function getFunctionsByCategory(): Record<FunctionCategory, FunctionDefinition[]> {
  const result: Record<FunctionCategory, FunctionDefinition[]> = {
    math: [],
    text: [],
    logic: [],
    date: [],
    aggregate: [],
  }

  for (const func of Object.values(builtInFunctions)) {
    result[func.category].push(func)
  }

  // Sort each category alphabetically
  for (const category of Object.keys(result) as FunctionCategory[]) {
    result[category].sort((a, b) => a.name.localeCompare(b.name))
  }

  return result
}

export function getAllFunctions(): FunctionDefinition[] {
  return Object.values(builtInFunctions).sort((a, b) => a.name.localeCompare(b.name))
}
