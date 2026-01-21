/**
 * Formula Module
 * Public API for formula parsing, evaluation, and suggestions
 */

// Types
export type {
  Token,
  TokenType,
  ASTNode,
  ASTNodeType,
  FormulaValue,
  EvaluationContext,
  FormulaError,
  FormulaResult,
  FunctionDefinition,
  FunctionCategory,
  FormulaSuggestion,
  AutocompleteItem,
} from './types'

// Tokenizer
export { tokenize, getSupportedFunctions, FormulaTokenizer } from './tokenizer'

// Parser
export {
  parseFormula,
  validateFormula,
  extractColumnReferences,
  FormulaParser,
  type ParseResult,
} from './parser'

// Evaluator
export {
  evaluateFormula,
  evaluateFormulaForRows,
  inferFormulaType,
  validateFormulaWithColumns,
  FormulaEvaluator,
} from './evaluator'

// Functions
export {
  builtInFunctions,
  executeFunction,
  getFunctionsByCategory,
  getAllFunctions,
} from './functions'

// Suggestions
export {
  suggestFormulasFromName,
  getColumnAutocomplete,
  getFunctionAutocomplete,
  getAutocompleteItems,
} from './suggestions'
