import type { FormulaError } from './types'
import { parseFormula } from './parser'
import { FormulaTokenizeError, tokenize } from './tokenizer'

export interface FormulaColumnReference {
  id: string
  name: string
}

export type CanonicalizeFormulaResult =
  | { success: true; formula: string }
  | { success: false; error: FormulaError }

/**
 * Rewrites only parsed column-reference tokens to stable column IDs.
 * String contents and other formula text are preserved byte-for-byte.
 */
export function canonicalizeFormulaReferences(
  formula: string,
  columns: FormulaColumnReference[],
): CanonicalizeFormulaResult {
  try {
    const parsed = parseFormula(formula)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error ?? { message: 'Formula could not be parsed' },
      }
    }
    const tokens = tokenize(formula)
    const replacements: Array<{ start: number; end: number; value: string }> = []

    for (const token of tokens) {
      if (token.type !== 'COLUMN_REF') continue
      const reference = String(token.value)
      const column = columns.find(
        (candidate) =>
          candidate.id === reference ||
          candidate.name.toLowerCase() === reference.toLowerCase(),
      )
      if (!column) {
        return {
          success: false,
          error: {
            message: `Column not found: ${reference}`,
            position: token.position,
            length: token.length,
          },
        }
      }
      replacements.push({
        start: token.position,
        end: token.position + token.length,
        value: `[${column.id}]`,
      })
    }

    let canonical = formula
    for (const replacement of replacements.reverse()) {
      canonical =
        canonical.slice(0, replacement.start) +
        replacement.value +
        canonical.slice(replacement.end)
    }
    return { success: true, formula: canonical }
  } catch (error) {
    if (error instanceof FormulaTokenizeError) {
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
      error: { message: error instanceof Error ? error.message : String(error) },
    }
  }
}
