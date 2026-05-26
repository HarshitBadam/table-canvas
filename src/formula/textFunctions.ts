import { registerFunction } from './registry'

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
    return pos >= 0 ? pos + 1 : null // 1-based index
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
      return str.split(oldText).join(newText)
    }

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
