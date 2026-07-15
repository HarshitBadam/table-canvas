import type { CellValue, ColumnSchema } from '@/types'
import { evaluateFormula } from './evaluator'
import type { FormulaValue } from './types'
import { extractColumnReferences } from './parser'

export interface ComputedColumnEvaluation {
  rows: Record<string, CellValue>[]
  errors: Array<{ columnId: string; rowId: string; message: string }>
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function coerceComputedValue(value: FormulaValue | undefined, type: ColumnSchema['type']): CellValue {
  if (value === undefined || value === null || value === '') return null

  if (type === 'number') {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : null
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    const normalized = String(value).trim().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    if (['false', '0', 'no'].includes(normalized)) return false
    return null
  }

  return value instanceof Date ? value.toISOString() : value
}

interface ComputedColumnPlan {
  ordered: ColumnSchema[]
  invalid: Set<string>
}

function getComputedColumnPlan(columns: ColumnSchema[]): ComputedColumnPlan {
  const computed = columns.filter((column) => column.isComputed && column.formula)
  const byName = new Map<string, ColumnSchema>()
  for (const column of columns) {
    byName.set(normalize(column.name), column)
    byName.set(column.id, column)
  }

  const dependencies = new Map<string, string[]>()
  for (const column of computed) {
    const refs = extractColumnReferences(column.canonicalFormula ?? column.formula!)
    dependencies.set(
      column.id,
      refs
        .map((ref) => byName.get(normalize(ref)) ?? byName.get(ref))
        .filter((dependency): dependency is ColumnSchema =>
          Boolean(dependency?.isComputed && dependency.formula),
        )
        .map((dependency) => dependency.id),
    )
  }

  const ordered: ColumnSchema[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const invalid = new Set<string>()

  const visit = (column: ColumnSchema): boolean => {
    if (visited.has(column.id)) return !invalid.has(column.id)
    if (visiting.has(column.id)) {
      invalid.add(column.id)
      return false
    }
    visiting.add(column.id)
    let valid = true
    for (const dependencyId of dependencies.get(column.id) ?? []) {
      const dependency = computed.find((candidate) => candidate.id === dependencyId)
      if (dependency && !visit(dependency)) valid = false
    }
    visiting.delete(column.id)
    visited.add(column.id)
    if (valid && !invalid.has(column.id)) {
      ordered.push(column)
    } else {
      invalid.add(column.id)
    }
    return valid
  }

  for (const column of computed) visit(column)
  return { ordered, invalid }
}

export function evaluateComputedColumns(
  rows: Record<string, CellValue>[],
  columns: ColumnSchema[],
): ComputedColumnEvaluation {
  const { ordered: computedColumns, invalid } = getComputedColumnPlan(columns)
  if (computedColumns.length === 0 && invalid.size === 0) return { rows, errors: [] }

  const errors: ComputedColumnEvaluation['errors'] = []
  const formulaColumns = columns.map(({ id, name, type }) => ({ id, name, type }))
  const evaluatedRows = rows.map((row) => {
    const evaluatedRow = { ...row }
    const formulaRow = evaluatedRow as Record<string, string | number | boolean | null>

    for (const columnId of invalid) {
      evaluatedRow[columnId] = null
      errors.push({
        columnId,
        rowId: String(row.__rowId ?? ''),
        message: 'Circular formula dependency',
      })
    }

    for (const column of computedColumns) {
      const result = evaluateFormula(column.canonicalFormula ?? column.formula!, {
        row: formulaRow,
        columns: formulaColumns,
      })

      if (!result.success) {
        evaluatedRow[column.id] = null
        errors.push({
          columnId: column.id,
          rowId: String(row.__rowId ?? ''),
          message: result.error?.message ?? 'Formula could not be evaluated',
        })
        continue
      }

      evaluatedRow[column.id] = coerceComputedValue(result.value, column.type)
    }

    return evaluatedRow
  })

  return { rows: evaluatedRows, errors }
}
