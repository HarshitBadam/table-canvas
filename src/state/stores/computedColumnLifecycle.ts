import type { ColumnSchema } from '@/types'
import { extractColumnReferences } from '@/formula/parser'
import type { ColumnOperationResult, ProjectStoreState } from './types'

type ColumnOperationFailure = Extract<ColumnOperationResult, { ok: false }>

export function getFormulaDependencies(column: ColumnSchema, columns: ColumnSchema[]): string[] {
  const byReference = new Map<string, string>()
  for (const candidate of columns) {
    byReference.set(candidate.id, candidate.id)
    byReference.set(candidate.name.trim().toLowerCase(), candidate.id)
  }
  return extractColumnReferences(column.canonicalFormula ?? column.formula ?? '')
    .map(reference => byReference.get(reference) ?? byReference.get(reference.trim().toLowerCase()))
    .filter((id): id is string => Boolean(id))
}

export function validateDependencyGraph(
  editedColumnId: string,
  columns: ColumnSchema[],
): ColumnOperationFailure | undefined {
  const edited = columns.find(column => column.id === editedColumnId)
  if (!edited) return undefined
  if (getFormulaDependencies(edited, columns).includes(editedColumnId)) {
    return {
      ok: false,
      code: 'CIRCULAR_DEPENDENCY',
      error: `Formula for "${edited.name}" cannot reference itself.`,
    }
  }

  const computed = new Map(
    columns
      .filter(column => column.isComputed && column.formula)
      .map(column => [column.id, column]),
  )
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (columnId: string): boolean => {
    if (visiting.has(columnId)) return true
    if (visited.has(columnId)) return false
    visiting.add(columnId)
    const column = computed.get(columnId)
    const circular = Boolean(column && getFormulaDependencies(column, columns)
      .some(dependencyId => computed.has(dependencyId) && visit(dependencyId)))
    visiting.delete(columnId)
    visited.add(columnId)
    return circular
  }
  if (!visit(editedColumnId)) return undefined
  return {
    ok: false,
    code: 'CIRCULAR_DEPENDENCY',
    error: `Formula for "${edited.name}" would create a circular dependency.`,
  }
}

export function getProjectColumnReferences(
  state: ProjectStoreState,
  tableId: string,
  column: ColumnSchema,
): string[] {
  const references: string[] = []
  for (const node of Object.values(state.nodes)) {
    if (node.kind === 'chart' && node.plan.sourceTableId === tableId) {
      const config = node.plan.config
      if (
        config.xAxis === column.id ||
        config.yAxis === column.id ||
        config.groupBy === column.id ||
        config.series?.includes(column.id)
      ) references.push(`chart "${node.name}"`)
      continue
    }
    if (node.kind !== 'derived_table') continue
    const transform = node.plan.transformDef
    let referenced = false
    switch (transform.type) {
      case 'join':
        referenced =
          (transform.leftTableId === tableId &&
            (transform.leftKey === column.id || transform.leftColumns?.includes(column.id))) ||
          (transform.rightTableId === tableId &&
            (transform.rightKey === column.id || transform.rightColumns?.includes(column.id))) ||
          false
        break
      case 'filter':
        referenced = transform.sourceTableId === tableId &&
          transform.conditions.some(condition => condition.columnId === column.id)
        break
      case 'select':
        referenced = transform.sourceTableId === tableId &&
          transform.columns.some(selected => selected.sourceColumnId === column.id)
        break
      case 'calculated_column':
        referenced = transform.sourceTableId === tableId &&
          extractColumnReferences(transform.expression).some(
            reference => reference === column.id || reference.toLowerCase() === column.name.toLowerCase(),
          )
        break
      case 'group_summarize':
        referenced = transform.sourceTableId === tableId &&
          (transform.groupByColumns.includes(column.id) ||
            transform.aggregations.some(aggregation => aggregation.columnId === column.id))
        break
      case 'union':
        break
    }
    if (referenced) references.push(`derived table "${node.name}"`)
  }
  return references
}
