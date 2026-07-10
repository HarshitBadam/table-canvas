import type { EvaluationContext, FormulaValue } from './types'

export function createContext(
  row: Record<string, unknown>,
  columns?: Array<{ id: string; name: string; type: string }>,
): EvaluationContext {
  const inferredColumns = columns ?? Object.keys(row).map(id => ({
    id,
    name: id,
    type: typeof row[id] === 'number' ? 'number' : 'string',
  }))
  const formulaRow = row as Record<string, FormulaValue>
  return { row: formulaRow, columns: inferredColumns, allRows: [formulaRow] }
}
