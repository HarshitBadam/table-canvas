/**
 * Formula Types
 * Type definitions for the formula parser and evaluator
 */


export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'COLUMN_REF'     // [column_name]
  | 'FUNCTION'       // SUM, AVG, IF, etc.
  | 'OPERATOR'       // +, -, *, /, etc.
  | 'COMPARISON'     // >, <, >=, <=, =, <>
  | 'LOGICAL'        // AND, OR, NOT
  | 'LPAREN'         // (
  | 'RPAREN'         // )
  | 'COMMA'          // ,
  | 'EOF'

export interface Token {
  type: TokenType
  value: string | number | boolean
  position: number
  length: number
}


export type ASTNodeType =
  | 'NumberLiteral'
  | 'StringLiteral'
  | 'BooleanLiteral'
  | 'ColumnReference'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'FunctionCall'
  | 'ConditionalExpression'

export interface BaseASTNode {
  type: ASTNodeType
  position: number
}

export interface NumberLiteralNode extends BaseASTNode {
  type: 'NumberLiteral'
  value: number
}

export interface StringLiteralNode extends BaseASTNode {
  type: 'StringLiteral'
  value: string
}

export interface BooleanLiteralNode extends BaseASTNode {
  type: 'BooleanLiteral'
  value: boolean
}

export interface ColumnReferenceNode extends BaseASTNode {
  type: 'ColumnReference'
  columnName: string
  columnId?: string // Resolved column ID
}

export interface BinaryExpressionNode extends BaseASTNode {
  type: 'BinaryExpression'
  operator: string
  left: ASTNode
  right: ASTNode
}

export interface UnaryExpressionNode extends BaseASTNode {
  type: 'UnaryExpression'
  operator: string
  argument: ASTNode
}

export interface FunctionCallNode extends BaseASTNode {
  type: 'FunctionCall'
  name: string
  arguments: ASTNode[]
}

export interface ConditionalExpressionNode extends BaseASTNode {
  type: 'ConditionalExpression'
  condition: ASTNode
  consequent: ASTNode
  alternate: ASTNode
}

export type ASTNode =
  | NumberLiteralNode
  | StringLiteralNode
  | BooleanLiteralNode
  | ColumnReferenceNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | FunctionCallNode
  | ConditionalExpressionNode


export type FormulaValue = string | number | boolean | null | Date

export interface EvaluationContext {
  row: Record<string, FormulaValue>
  columns: Array<{ id: string; name: string; type: string }>
  allRows?: Array<Record<string, FormulaValue>> // For aggregate functions
}

export interface FormulaError {
  message: string
  position?: number
  length?: number
}

export interface FormulaResult {
  success: boolean
  value?: FormulaValue
  error?: FormulaError
  inferredType?: 'string' | 'number' | 'boolean' | 'date'
}


export type FunctionCategory = 'math' | 'text' | 'logic' | 'date' | 'aggregate'

export interface FunctionDefinition {
  name: string
  category: FunctionCategory
  description: string
  syntax: string
  minArgs: number
  maxArgs: number
  examples: string[]
  evaluate: (args: FormulaValue[], context: EvaluationContext) => FormulaValue
}


export interface FormulaSuggestion {
  formula: string
  description: string
  confidence: 'high' | 'medium' | 'low'
  basedOn: string[] // Column names used
}

export interface AutocompleteItem {
  type: 'column' | 'function'
  label: string
  value: string
  description?: string
  category?: FunctionCategory
  columnType?: string
}
