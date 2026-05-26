import { registerFunction } from './registry'

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
