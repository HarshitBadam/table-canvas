import { registerFunction } from './registry'

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
