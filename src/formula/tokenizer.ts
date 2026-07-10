import type { Token } from './types'

const FUNCTIONS = new Set([
  // Math
  'SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'ROUND', 'ABS', 'FLOOR', 'CEIL', 'POWER', 'SQRT', 'MOD',
  // Text
  'CONCAT', 'UPPER', 'LOWER', 'TRIM', 'LEFT', 'RIGHT', 'MID', 'LEN', 'FIND', 'REPLACE', 'SUBSTITUTE',
  // Logic
  'IF', 'AND', 'OR', 'NOT', 'ISNULL', 'IFNULL', 'COALESCE',
  // Date
  'NOW', 'TODAY', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'DATE', 'DATEDIFF',
  // Type conversion
  'NUMBER', 'TEXT', 'BOOLEAN',
])

const OPERATORS = new Set(['+', '-', '*', '/', '%', '^'])
const LOGICAL_OPERATORS = new Set(['AND', 'OR', 'NOT'])

class FormulaTokenizer {
  private input: string
  private position: number = 0
  private tokens: Token[] = []

  constructor(input: string) {
    this.input = input
  }

  tokenize(): Token[] {
    this.tokens = []
    this.position = 0

    while (this.position < this.input.length) {
      this.skipWhitespace()
      if (this.position >= this.input.length) break

      const char = this.input[this.position]

      if (char === '[') {
        this.readColumnReference()
        continue
      }

      if (char === '"' || char === "'") {
        this.readString(char)
        continue
      }

      if (this.isDigit(char) || (char === '.' && this.isDigit(this.peek(1)))) {
        this.readNumber()
        continue
      }

      if (char === '-' && this.isDigit(this.peek(1)) && this.shouldBeNegativeNumber()) {
        this.readNumber()
        continue
      }

      if (this.isComparisonOperator()) {
        this.readComparisonOperator()
        continue
      }

      if (OPERATORS.has(char)) {
        this.tokens.push({
          type: 'OPERATOR',
          value: char,
          position: this.position,
          length: 1,
        })
        this.position++
        continue
      }

      if (char === '(') {
        this.tokens.push({
          type: 'LPAREN',
          value: '(',
          position: this.position,
          length: 1,
        })
        this.position++
        continue
      }

      if (char === ')') {
        this.tokens.push({
          type: 'RPAREN',
          value: ')',
          position: this.position,
          length: 1,
        })
        this.position++
        continue
      }

      if (char === ',') {
        this.tokens.push({
          type: 'COMMA',
          value: ',',
          position: this.position,
          length: 1,
        })
        this.position++
        continue
      }

      if (this.isAlpha(char)) {
        this.readIdentifier()
        continue
      }

      this.position++
    }

    this.tokens.push({
      type: 'EOF',
      value: '',
      position: this.position,
      length: 0,
    })

    return this.tokens
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
      this.position++
    }
  }

  private peek(offset: number = 0): string {
    const pos = this.position + offset
    return pos < this.input.length ? this.input[pos] : ''
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char)
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char)
  }

  private isAlphaNumeric(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char)
  }

  private shouldBeNegativeNumber(): boolean {
    // A minus is a negative sign if:
    // 1. It's at the start
    // 2. It follows an operator, comparison, open paren, or comma
    if (this.tokens.length === 0) return true
    const lastToken = this.tokens[this.tokens.length - 1]
    return ['OPERATOR', 'COMPARISON', 'LPAREN', 'COMMA', 'LOGICAL'].includes(lastToken.type)
  }

  private isComparisonOperator(): boolean {
    const char = this.input[this.position]
    const next = this.peek(1)
    
    if ((char === '>' || char === '<' || char === '!' || char === '=') && next === '=') {
      return true
    }
    if (char === '<' && next === '>') {
      return true
    }
    
    return char === '>' || char === '<' || char === '='
  }

  private readComparisonOperator(): void {
    const start = this.position
    const char = this.input[this.position]
    const next = this.peek(1)

    let value: string

    if ((char === '>' && next === '=') || 
        (char === '<' && next === '=') || 
        (char === '!' && next === '=') || 
        (char === '=' && next === '=') ||
        (char === '<' && next === '>')) {
      value = char + next
      this.position += 2
    } else {
      value = char
      this.position++
    }

    this.tokens.push({
      type: 'COMPARISON',
      value,
      position: start,
      length: value.length,
    })
  }

  private readColumnReference(): void {
    const start = this.position
    this.position++

    let columnName = ''
    while (this.position < this.input.length && this.input[this.position] !== ']') {
      columnName += this.input[this.position]
      this.position++
    }

    if (this.position < this.input.length) {
      this.position++
    }

    this.tokens.push({
      type: 'COLUMN_REF',
      value: columnName.trim(),
      position: start,
      length: this.position - start,
    })
  }

  private readString(quote: string): void {
    const start = this.position
    this.position++

    let value = ''
    while (this.position < this.input.length) {
      const char = this.input[this.position]
      
      if (char === '\\' && this.peek(1) === quote) {
        value += quote
        this.position += 2
        continue
      }

      if (char === quote) {
        this.position++
        break
      }

      value += char
      this.position++
    }

    this.tokens.push({
      type: 'STRING',
      value,
      position: start,
      length: this.position - start,
    })
  }

  private readNumber(): void {
    const start = this.position
    let numStr = ''

    if (this.input[this.position] === '-') {
      numStr += '-'
      this.position++
    }

    while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
      numStr += this.input[this.position]
      this.position++
    }

    if (this.position < this.input.length && this.input[this.position] === '.') {
      numStr += '.'
      this.position++
      while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
        numStr += this.input[this.position]
        this.position++
      }
    }

    // Scientific notation
    if (this.position < this.input.length && 
        (this.input[this.position] === 'e' || this.input[this.position] === 'E')) {
      numStr += this.input[this.position]
      this.position++
      if (this.input[this.position] === '+' || this.input[this.position] === '-') {
        numStr += this.input[this.position]
        this.position++
      }
      while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
        numStr += this.input[this.position]
        this.position++
      }
    }

    this.tokens.push({
      type: 'NUMBER',
      value: parseFloat(numStr),
      position: start,
      length: this.position - start,
    })
  }

  private readIdentifier(): void {
    const start = this.position
    let identifier = ''

    while (this.position < this.input.length && this.isAlphaNumeric(this.input[this.position])) {
      identifier += this.input[this.position]
      this.position++
    }

    const upper = identifier.toUpperCase()

    if (upper === 'TRUE' || upper === 'FALSE') {
      this.tokens.push({
        type: 'BOOLEAN',
        value: upper === 'TRUE',
        position: start,
        length: identifier.length,
      })
      return
    }

    if (LOGICAL_OPERATORS.has(upper)) {
      this.tokens.push({
        type: 'LOGICAL',
        value: upper,
        position: start,
        length: identifier.length,
      })
      return
    }

    if (FUNCTIONS.has(upper)) {
      this.tokens.push({
        type: 'FUNCTION',
        value: upper,
        position: start,
        length: identifier.length,
      })
      return
    }

    // Unknown identifier - treat as a potential function (for extensibility)
    this.tokens.push({
      type: 'FUNCTION',
      value: upper,
      position: start,
      length: identifier.length,
    })
  }
}

export function tokenize(formula: string): Token[] {
  const tokenizer = new FormulaTokenizer(formula)
  return tokenizer.tokenize()
}

