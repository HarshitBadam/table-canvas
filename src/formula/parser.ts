import { Token, TokenType, ASTNode, FormulaError } from './types'
import { tokenize } from './tokenizer'

export interface ParseResult {
  success: boolean
  ast?: ASTNode
  error?: FormulaError
}

export class FormulaParser {
  private tokens: Token[] = []
  private position: number = 0
  private formula: string = ''

  constructor(formula: string) {
    this.formula = formula
  }

  parse(): ParseResult {
    try {
      this.tokens = tokenize(this.formula)
      this.position = 0

      if (this.tokens.length === 1 && this.tokens[0].type === 'EOF') {
        return {
          success: false,
          error: { message: 'Empty formula', position: 0 },
        }
      }

      const ast = this.parseExpression()

      if (!this.isAtEnd()) {
        const token = this.peek()
        return {
          success: false,
          error: {
            message: `Unexpected token: ${token.value}`,
            position: token.position,
            length: token.length,
          },
        }
      }

      return { success: true, ast }
    } catch (error) {
      if (error instanceof ParseError) {
        return {
          success: false,
          error: {
            message: error.message,
            position: error.position,
            length: error.length,
          },
        }
      }
      return {
        success: false,
        error: { message: String(error) },
      }
    }
  }

  private parseExpression(): ASTNode {
    return this.parseLogicalOr()
  }

  // Logical OR (lowest precedence)
  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd()

    // Check type AND value before consuming to avoid eating wrong tokens
    while (this.check('LOGICAL') && this.peek().value === 'OR') {
      this.advance()
      const right = this.parseLogicalAnd()
      left = {
        type: 'BinaryExpression',
        operator: 'OR',
        left,
        right,
        position: left.position,
      }
    }

    return left
  }

  private parseLogicalAnd(): ASTNode {
    let left = this.parseComparison()

    // Check type AND value before consuming to avoid eating wrong tokens
    while (this.check('LOGICAL') && this.peek().value === 'AND') {
      this.advance()
      const right = this.parseComparison()
      left = {
        type: 'BinaryExpression',
        operator: 'AND',
        left,
        right,
        position: left.position,
      }
    }

    return left
  }

  private parseComparison(): ASTNode {
    let left = this.parseAddition()

    while (this.match('COMPARISON')) {
      const operator = String(this.previous().value)
      const right = this.parseAddition()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        position: left.position,
      }
    }

    return left
  }

  private parseAddition(): ASTNode {
    let left = this.parseMultiplication()

    while (this.check('OPERATOR') && (this.peek().value === '+' || this.peek().value === '-')) {
      this.advance()
      const operator = String(this.previous().value)
      const right = this.parseMultiplication()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        position: left.position,
      }
    }

    return left
  }

  private parseMultiplication(): ASTNode {
    let left = this.parsePower()

    while (this.check('OPERATOR') && 
           (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
      this.advance()
      const operator = String(this.previous().value)
      const right = this.parsePower()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        position: left.position,
      }
    }

    return left
  }

  // Power (right associative)
  private parsePower(): ASTNode {
    const left = this.parseUnary()

    if (this.check('OPERATOR') && this.peek().value === '^') {
      this.advance()
      const right = this.parsePower()
      return {
        type: 'BinaryExpression',
        operator: '^',
        left,
        right,
        position: left.position,
      }
    }

    return left
  }

  private parseUnary(): ASTNode {
    if (this.match('LOGICAL') && this.previous().value === 'NOT') {
      const argument = this.parseUnary()
      return {
        type: 'UnaryExpression',
        operator: 'NOT',
        argument,
        position: this.previous().position,
      }
    }

    if (this.check('OPERATOR') && this.peek().value === '-') {
      this.advance()
      const argument = this.parseUnary()
      return {
        type: 'UnaryExpression',
        operator: '-',
        argument,
        position: this.previous().position,
      }
    }

    return this.parsePrimary()
  }

  private parsePrimary(): ASTNode {
    const token = this.peek()

    if (this.match('NUMBER')) {
      return {
        type: 'NumberLiteral',
        value: this.previous().value as number,
        position: this.previous().position,
      }
    }

    if (this.match('STRING')) {
      return {
        type: 'StringLiteral',
        value: this.previous().value as string,
        position: this.previous().position,
      }
    }

    if (this.match('BOOLEAN')) {
      return {
        type: 'BooleanLiteral',
        value: this.previous().value as boolean,
        position: this.previous().position,
      }
    }

    if (this.match('COLUMN_REF')) {
      return {
        type: 'ColumnReference',
        columnName: this.previous().value as string,
        position: this.previous().position,
      }
    }

    if (this.match('FUNCTION')) {
      const functionName = this.previous().value as string
      const functionPos = this.previous().position
      
      if (!this.match('LPAREN')) {
        throw new ParseError(
          `Expected '(' after function name ${functionName}`,
          this.peek().position,
          1
        )
      }

      const args: ASTNode[] = []

      if (!this.check('RPAREN')) {
        do {
          args.push(this.parseExpression())
        } while (this.match('COMMA'))
      }

      if (!this.match('RPAREN')) {
        throw new ParseError(
          `Expected ')' after function arguments`,
          this.peek().position,
          1
        )
      }

      // Special handling for IF function - convert to ConditionalExpression
      if (functionName === 'IF') {
        if (args.length < 2 || args.length > 3) {
          throw new ParseError(
            `IF requires 2-3 arguments, got ${args.length}`,
            functionPos,
            2
          )
        }
        return {
          type: 'ConditionalExpression',
          condition: args[0],
          consequent: args[1],
          alternate: args[2] || { type: 'StringLiteral', value: '', position: functionPos },
          position: functionPos,
        }
      }

      return {
        type: 'FunctionCall',
        name: functionName,
        arguments: args,
        position: functionPos,
      }
    }

    if (this.match('LPAREN')) {
      const expr = this.parseExpression()
      if (!this.match('RPAREN')) {
        throw new ParseError(
          `Expected ')' after expression`,
          this.peek().position,
          1
        )
      }
      return expr
    }

    throw new ParseError(
      `Unexpected token: ${token.value || token.type}`,
      token.position,
      token.length
    )
  }

  private peek(): Token {
    return this.tokens[this.position]
  }

  private previous(): Token {
    return this.tokens[this.position - 1]
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF'
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false
    return this.peek().type === type
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.position++
    return this.previous()
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance()
        return true
      }
    }
    return false
  }
}

class ParseError extends Error {
  position: number
  length: number

  constructor(message: string, position: number, length: number = 1) {
    super(message)
    this.position = position
    this.length = length
    this.name = 'ParseError'
  }
}

export function parseFormula(formula: string): ParseResult {
  const parser = new FormulaParser(formula)
  return parser.parse()
}

export function extractColumnReferences(formula: string): string[] {
  const result = parseFormula(formula)
  if (!result.success || !result.ast) {
    return []
  }

  const columns: string[] = []
  
  function traverse(node: ASTNode): void {
    switch (node.type) {
      case 'ColumnReference':
        columns.push(node.columnName)
        break
      case 'BinaryExpression':
        traverse(node.left)
        traverse(node.right)
        break
      case 'UnaryExpression':
        traverse(node.argument)
        break
      case 'FunctionCall':
        node.arguments.forEach(traverse)
        break
      case 'ConditionalExpression':
        traverse(node.condition)
        traverse(node.consequent)
        traverse(node.alternate)
        break
    }
  }

  traverse(result.ast)
  return [...new Set(columns)]
}
