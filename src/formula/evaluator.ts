/**
 * Formula Evaluator
 * Executes formulas against row data
 */

import {
  ASTNode,
  FormulaValue,
  EvaluationContext,
  FormulaResult,
  FormulaError,
} from './types'
import { parseFormula, extractColumnReferences } from './parser'
import { builtInFunctions, executeFunction } from './functions'

export class FormulaEvaluator {
  private context: EvaluationContext

  constructor(context: EvaluationContext) {
    this.context = context
  }

  evaluate(node: ASTNode): FormulaValue {
    switch (node.type) {
      case 'NumberLiteral':
        return node.value

      case 'StringLiteral':
        return node.value

      case 'BooleanLiteral':
        return node.value

      case 'ColumnReference':
        return this.evaluateColumnReference(node.columnName)

      case 'BinaryExpression':
        return this.evaluateBinaryExpression(node.operator, node.left, node.right)

      case 'UnaryExpression':
        return this.evaluateUnaryExpression(node.operator, node.argument)

      case 'FunctionCall':
        return this.evaluateFunctionCall(node.name, node.arguments)

      case 'ConditionalExpression':
        return this.evaluateConditional(node.condition, node.consequent, node.alternate)

      default:
        throw new Error(`Unknown node type: ${(node as ASTNode).type}`)
    }
  }

  private evaluateColumnReference(columnName: string): FormulaValue {
    // Try to find column by name first
    const column = this.context.columns.find(
      c => c.name.toLowerCase() === columnName.toLowerCase() || c.id === columnName
    )

    if (!column) {
      throw new Error(`Column not found: ${columnName}`)
    }

    const value = this.context.row[column.id]
    
    // Handle empty/undefined values
    if (value === undefined || value === null || value === '') {
      return null
    }

    return value
  }

  private evaluateBinaryExpression(operator: string, leftNode: ASTNode, rightNode: ASTNode): FormulaValue {
    const left = this.evaluate(leftNode)
    const right = this.evaluate(rightNode)

    // Handle null values in arithmetic
    if (operator === '+' || operator === '-' || operator === '*' || operator === '/' || operator === '%' || operator === '^') {
      if (left === null || right === null) {
        return null
      }
    }

    switch (operator) {
      // Arithmetic
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left ?? '') + String(right ?? '')
        }
        return (left as number) + (right as number)
      
      case '-':
        return (left as number) - (right as number)
      
      case '*':
        return (left as number) * (right as number)
      
      case '/':
        if (right === 0) {
          throw new Error('Division by zero')
        }
        return (left as number) / (right as number)
      
      case '%':
        return (left as number) % (right as number)
      
      case '^':
        return Math.pow(left as number, right as number)

      // Comparison
      case '=':
      case '==':
        return left === right
      
      case '<>':
      case '!=':
        return left !== right
      
      case '>':
        return (left as number) > (right as number)
      
      case '<':
        return (left as number) < (right as number)
      
      case '>=':
        return (left as number) >= (right as number)
      
      case '<=':
        return (left as number) <= (right as number)

      // Logical
      case 'AND':
        return Boolean(left) && Boolean(right)
      
      case 'OR':
        return Boolean(left) || Boolean(right)

      default:
        throw new Error(`Unknown operator: ${operator}`)
    }
  }

  private evaluateUnaryExpression(operator: string, argumentNode: ASTNode): FormulaValue {
    const argument = this.evaluate(argumentNode)

    switch (operator) {
      case '-':
        if (argument === null) return null
        return -(argument as number)
      
      case 'NOT':
        return !argument

      default:
        throw new Error(`Unknown unary operator: ${operator}`)
    }
  }

  private evaluateFunctionCall(name: string, argumentNodes: ASTNode[]): FormulaValue {
    const func = builtInFunctions[name.toUpperCase()]
    
    if (!func) {
      throw new Error(`Unknown function: ${name}`)
    }

    // Check argument count
    if (argumentNodes.length < func.minArgs) {
      throw new Error(`${name} requires at least ${func.minArgs} argument(s)`)
    }
    if (argumentNodes.length > func.maxArgs) {
      throw new Error(`${name} accepts at most ${func.maxArgs} argument(s)`)
    }

    // Evaluate arguments
    const args = argumentNodes.map(arg => this.evaluate(arg))

    return executeFunction(name, args, this.context)
  }

  private evaluateConditional(condition: ASTNode, consequent: ASTNode, alternate: ASTNode): FormulaValue {
    const conditionValue = this.evaluate(condition)
    
    if (conditionValue) {
      return this.evaluate(consequent)
    } else {
      return this.evaluate(alternate)
    }
  }
}

/**
 * Evaluate a formula string against row data
 */
export function evaluateFormula(
  formula: string,
  context: EvaluationContext
): FormulaResult {
  try {
    const parseResult = parseFormula(formula)
    
    if (!parseResult.success || !parseResult.ast) {
      return {
        success: false,
        error: parseResult.error,
      }
    }

    const evaluator = new FormulaEvaluator(context)
    const value = evaluator.evaluate(parseResult.ast)

    // Infer result type
    let inferredType: 'string' | 'number' | 'boolean' | 'date' | undefined
    if (typeof value === 'number') {
      inferredType = 'number'
    } else if (typeof value === 'boolean') {
      inferredType = 'boolean'
    } else if (typeof value === 'string') {
      inferredType = 'string'
    } else if (value instanceof Date) {
      inferredType = 'date'
    }

    return {
      success: true,
      value,
      inferredType,
    }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

/**
 * Evaluate a formula for multiple rows (batch evaluation)
 */
export function evaluateFormulaForRows(
  formula: string,
  rows: Array<Record<string, FormulaValue>>,
  columns: Array<{ id: string; name: string; type: string }>
): Array<FormulaResult> {
  const parseResult = parseFormula(formula)
  
  if (!parseResult.success || !parseResult.ast) {
    // Return same error for all rows
    return rows.map(() => ({
      success: false,
      error: parseResult.error,
    }))
  }

  return rows.map(row => {
    try {
      const context: EvaluationContext = { row, columns, allRows: rows }
      const evaluator = new FormulaEvaluator(context)
      const value = evaluator.evaluate(parseResult.ast!)

      let inferredType: 'string' | 'number' | 'boolean' | 'date' | undefined
      if (typeof value === 'number') {
        inferredType = 'number'
      } else if (typeof value === 'boolean') {
        inferredType = 'boolean'
      } else if (typeof value === 'string') {
        inferredType = 'string'
      } else if (value instanceof Date) {
        inferredType = 'date'
      }

      return {
        success: true,
        value,
        inferredType,
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  })
}

/**
 * Infer the result type of a formula without evaluating it
 */
export function inferFormulaType(
  formula: string,
  columns: Array<{ id: string; name: string; type: string }>
): 'string' | 'number' | 'boolean' | 'date' | 'unknown' {
  const parseResult = parseFormula(formula)
  if (!parseResult.success || !parseResult.ast) {
    return 'unknown'
  }

  return inferNodeType(parseResult.ast, columns)
}

function inferNodeType(
  node: ASTNode,
  columns: Array<{ id: string; name: string; type: string }>
): 'string' | 'number' | 'boolean' | 'date' | 'unknown' {
  switch (node.type) {
    case 'NumberLiteral':
      return 'number'

    case 'StringLiteral':
      return 'string'

    case 'BooleanLiteral':
      return 'boolean'

    case 'ColumnReference': {
      const column = columns.find(
        c => c.name.toLowerCase() === node.columnName.toLowerCase() || c.id === node.columnName
      )
      if (!column) return 'unknown'
      if (column.type === 'date' || column.type === 'datetime') return 'date'
      return column.type as 'string' | 'number' | 'boolean'
    }

    case 'BinaryExpression': {
      const op = node.operator
      // Comparison operators always return boolean
      if (['=', '==', '<>', '!=', '>', '<', '>=', '<='].includes(op)) {
        return 'boolean'
      }
      // Logical operators return boolean
      if (['AND', 'OR'].includes(op)) {
        return 'boolean'
      }
      // Arithmetic with + could be string concatenation
      if (op === '+') {
        const leftType = inferNodeType(node.left, columns)
        const rightType = inferNodeType(node.right, columns)
        if (leftType === 'string' || rightType === 'string') {
          return 'string'
        }
      }
      // Other arithmetic returns number
      return 'number'
    }

    case 'UnaryExpression':
      if (node.operator === 'NOT') return 'boolean'
      return 'number'

    case 'FunctionCall': {
      const funcName = node.name.toUpperCase()
      // Math functions return number
      if (['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'ROUND', 'ABS', 'FLOOR', 'CEIL', 'POWER', 'SQRT', 'MOD', 'LEN'].includes(funcName)) {
        return 'number'
      }
      // Text functions return string
      if (['CONCAT', 'UPPER', 'LOWER', 'TRIM', 'LEFT', 'RIGHT', 'MID', 'SUBSTITUTE', 'REPLACE', 'TEXT'].includes(funcName)) {
        return 'string'
      }
      // Logic functions return boolean
      if (['AND', 'OR', 'NOT', 'ISNULL'].includes(funcName)) {
        return 'boolean'
      }
      // Date functions
      if (['NOW', 'TODAY', 'DATE'].includes(funcName)) {
        return 'date'
      }
      if (['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'DATEDIFF'].includes(funcName)) {
        return 'number'
      }
      return 'unknown'
    }

    case 'ConditionalExpression':
      // Return type of consequent (assuming both branches have same type)
      return inferNodeType(node.consequent, columns)

    default:
      return 'unknown'
  }
}

/**
 * Check if a formula is valid for given columns
 */
export function validateFormulaWithColumns(
  formula: string,
  columns: Array<{ id: string; name: string; type: string }>
): FormulaError[] {
  const errors: FormulaError[] = []
  
  const parseResult = parseFormula(formula)
  if (!parseResult.success) {
    if (parseResult.error) {
      errors.push(parseResult.error)
    }
    return errors
  }

  // Check that all referenced columns exist
  const columnRefs = extractColumnReferences(formula)
  for (const ref of columnRefs) {
    const column = columns.find(
      c => c.name.toLowerCase() === ref.toLowerCase() || c.id === ref
    )
    if (!column) {
      errors.push({
        message: `Column not found: ${ref}`,
      })
    }
  }

  return errors
}
