import type { SuggestionConfidence, UserColumnType } from '@/types'


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


type ASTNodeType =
  | 'NumberLiteral'
  | 'StringLiteral'
  | 'BooleanLiteral'
  | 'ColumnReference'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'FunctionCall'
  | 'ConditionalExpression'

interface BaseASTNode {
  type: ASTNodeType
  position: number
}

interface NumberLiteralNode extends BaseASTNode {
  type: 'NumberLiteral'
  value: number
}

interface StringLiteralNode extends BaseASTNode {
  type: 'StringLiteral'
  value: string
}

interface BooleanLiteralNode extends BaseASTNode {
  type: 'BooleanLiteral'
  value: boolean
}

interface ColumnReferenceNode extends BaseASTNode {
  type: 'ColumnReference'
  columnName: string
  columnId?: string // Resolved column ID
}

interface BinaryExpressionNode extends BaseASTNode {
  type: 'BinaryExpression'
  operator: string
  left: ASTNode
  right: ASTNode
}

interface UnaryExpressionNode extends BaseASTNode {
  type: 'UnaryExpression'
  operator: string
  argument: ASTNode
}

interface FunctionCallNode extends BaseASTNode {
  type: 'FunctionCall'
  name: string
  arguments: ASTNode[]
}

interface ConditionalExpressionNode extends BaseASTNode {
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
  inferredType?: UserColumnType
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
  confidence: SuggestionConfidence
  basedOn: string[] // Column names used
}

