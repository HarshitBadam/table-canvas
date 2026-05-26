import { registerFunction } from './registry'

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
    return !args[0]
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
