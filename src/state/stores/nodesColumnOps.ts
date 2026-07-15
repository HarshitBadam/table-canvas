import type { StateCreator } from 'zustand'
import type { ColumnOperationResult, ProjectStoreState, NodesSliceState } from './types'
import type { ColumnSchema, SourceTableNode, UserColumnType } from '@/types'
import {
  canonicalizeFormulaReferences,
  inferFormulaType,
  validateFormulaWithColumns,
} from '@/formula'
import { extractColumnReferences } from '@/formula/parser'

type SetFn = Parameters<StateCreator<ProjectStoreState, [['zustand/immer', never]], [], NodesSliceState>>[0]
type GetFn = Parameters<StateCreator<ProjectStoreState, [['zustand/immer', never]], [], NodesSliceState>>[1]
type ColumnOperationFailure = Extract<ColumnOperationResult, { ok: false }>

function validateColumnName(
  columns: ColumnSchema[],
  value: string,
  excludedColumnId?: string,
): ColumnOperationFailure | { ok: true; name: string } {
  const name = value.trim()
  if (!name) {
    return { ok: false, code: 'INVALID_NAME', error: 'Column name is required.' }
  }
  const duplicate = columns.some(
    (column) =>
      column.id !== excludedColumnId &&
      column.name.trim().toLowerCase() === name.toLowerCase(),
  )
  if (duplicate) {
    return {
      ok: false,
      code: 'DUPLICATE_NAME',
      error: `A column named "${name}" already exists.`,
    }
  }
  return { ok: true, name }
}

function prepareFormula(
  formula: string,
  columns: ColumnSchema[],
): { ok: true; source: string; canonical: string; inferredType: UserColumnType } | ColumnOperationFailure {
  const source = formula.trim()
  const columnInfo = columns.map(({ id, name, type }) => ({ id, name, type }))
  const errors = validateFormulaWithColumns(source, columnInfo)
  if (errors.length > 0) {
    return { ok: false, code: 'INVALID_FORMULA', error: errors[0].message }
  }
  const canonical = canonicalizeFormulaReferences(source, columnInfo)
  if (!canonical.success) {
    return { ok: false, code: 'INVALID_FORMULA', error: canonical.error.message }
  }
  const inferred = inferFormulaType(source, columnInfo)
  const inferredType: UserColumnType = inferred === 'unknown' ? 'string' : inferred
  return { ok: true, source, canonical: canonical.formula, inferredType }
}

function getFormulaDependencies(column: ColumnSchema, columns: ColumnSchema[]): string[] {
  const byReference = new Map<string, string>()
  for (const candidate of columns) {
    byReference.set(candidate.id, candidate.id)
    byReference.set(candidate.name.trim().toLowerCase(), candidate.id)
  }
  return extractColumnReferences(column.canonicalFormula ?? column.formula ?? '')
    .map(reference => byReference.get(reference) ?? byReference.get(reference.trim().toLowerCase()))
    .filter((id): id is string => Boolean(id))
}

function validateDependencyGraph(
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
  if (visit(editedColumnId)) {
    return {
      ok: false,
      code: 'CIRCULAR_DEPENDENCY',
      error: `Formula for "${edited.name}" would create a circular dependency.`,
    }
  }
  return undefined
}

function getProjectColumnReferences(
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
      ) {
        references.push(`chart "${node.name}"`)
      }
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

export function createColumnOps(set: SetFn, get: GetFn) {
  return {
    addColumn: (tableId: string, columnName: string, columnType: UserColumnType = 'string') => {
      const node = get().nodes[tableId]
      if (!node || node.kind !== 'source_table') {
        return { ok: false, code: 'TABLE_NOT_FOUND', error: 'Source table not found.' } satisfies ColumnOperationResult
      }
      const nameResult = validateColumnName(node.schema?.columns ?? [], columnName)
      if (!nameResult.ok) return nameResult
      const name = nameResult.name
      const colIndex = node.schema?.columns.length ?? 0
      const columnId = `col_${colIndex}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`

      set((state) => {
        const currentNode = state.nodes[tableId]
        if (currentNode && currentNode.kind === 'source_table') {
          const tableNode = currentNode as SourceTableNode
          if (!tableNode.schema) {
            tableNode.schema = { columns: [], rowCount: 0 }
          }

          tableNode.schema.columns.push({
            id: columnId,
            name,
            type: columnType,
            nullable: true,
          })

          tableNode.updatedAt = new Date().toISOString()

          const patches = state.patches[tableId]
          if (patches?.insertedRows) {
            patches.insertedRows.forEach(row => {
              if (row.values[columnId] === undefined) {
                row.values[columnId] = ''
              }
            })
          }
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
      return { ok: true, columnId } satisfies ColumnOperationResult
    },

    insertColumnAt: (tableId: string, columnName: string, columnType: UserColumnType, index: number, formula?: string) => {
      const node = get().nodes[tableId]
      if (!node || node.kind !== 'source_table') {
        return { ok: false, code: 'TABLE_NOT_FOUND', error: 'Source table not found.' } satisfies ColumnOperationResult
      }
      const columns = node.schema?.columns ?? []
      const nameResult = validateColumnName(columns, columnName)
      if (!nameResult.ok) return nameResult
      const name = nameResult.name
      const formulaResult = formula ? prepareFormula(formula, columns) : undefined
      if (formulaResult && !formulaResult.ok) return formulaResult
      const totalCols = columns.length
      const columnId = `col_${totalCols}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`

      set((state) => {
        const currentNode = state.nodes[tableId]
        if (currentNode && currentNode.kind === 'source_table') {
          const tableNode = currentNode as SourceTableNode
          if (!tableNode.schema) {
            tableNode.schema = { columns: [], rowCount: 0 }
          }

          const newColumn = {
            id: columnId,
            name,
            type: columnType,
            nullable: true,
            formula: formulaResult?.source,
            canonicalFormula: formulaResult?.canonical,
            isComputed: Boolean(formulaResult),
          }

          const insertIndex = Math.max(0, Math.min(index, tableNode.schema.columns.length))
          tableNode.schema.columns.splice(insertIndex, 0, newColumn)

          tableNode.updatedAt = new Date().toISOString()

          if (!formulaResult) {
            const patches = state.patches[tableId]
            if (patches?.insertedRows) {
              patches.insertedRows.forEach(row => {
                if (row.values[columnId] === undefined) {
                  row.values[columnId] = ''
                }
              })
            }
          }
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
      return { ok: true, columnId } satisfies ColumnOperationResult
    },

    addFormulaColumn: (tableId: string, columnName: string, formula: string, columnType: UserColumnType, index?: number) => {
      const node = get().nodes[tableId]
      if (!node || node.kind !== 'source_table') {
        return { ok: false, code: 'TABLE_NOT_FOUND', error: 'Source table not found.' } satisfies ColumnOperationResult
      }
      const columns = node.schema?.columns ?? []
      const nameResult = validateColumnName(columns, columnName)
      if (!nameResult.ok) return nameResult
      const formulaResult = prepareFormula(formula, columns)
      if (!formulaResult.ok) return formulaResult
      const name = nameResult.name
      const totalCols = columns.length
      const columnId = `formula_${totalCols}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`

      set((state) => {
        const currentNode = state.nodes[tableId]
        if (currentNode && currentNode.kind === 'source_table') {
          const tableNode = currentNode as SourceTableNode
          if (!tableNode.schema) {
            tableNode.schema = { columns: [], rowCount: 0 }
          }

          const newColumn = {
            id: columnId,
            name,
            type: columnType,
            nullable: true,
            formula: formulaResult.source,
            canonicalFormula: formulaResult.canonical,
            isComputed: true,
          }

          if (index !== undefined) {
            const insertIndex = Math.max(0, Math.min(index, tableNode.schema.columns.length))
            tableNode.schema.columns.splice(insertIndex, 0, newColumn)
          } else {
            tableNode.schema.columns.push(newColumn)
          }

          tableNode.updatedAt = new Date().toISOString()
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
      return { ok: true, columnId } satisfies ColumnOperationResult
    },

    updateFormulaColumn: (
      tableId: string,
      columnId: string,
      formula: string,
      columnType?: UserColumnType,
    ) => {
      const node = get().nodes[tableId]
      if (!node || node.kind !== 'source_table' || !node.schema) {
        return { ok: false, code: 'TABLE_NOT_FOUND', error: 'Source table not found.' } satisfies ColumnOperationResult
      }
      const column = node.schema.columns.find(candidate => candidate.id === columnId)
      if (!column) {
        return { ok: false, code: 'COLUMN_NOT_FOUND', error: 'Column not found.' } satisfies ColumnOperationResult
      }
      if (!column.isComputed) {
        return { ok: false, code: 'NOT_COMPUTED', error: 'Only formula columns can be edited.' } satisfies ColumnOperationResult
      }

      const formulaResult = prepareFormula(formula, node.schema.columns)
      if (!formulaResult.ok) return formulaResult
      const prospectiveColumns = node.schema.columns.map(candidate =>
        candidate.id === columnId
          ? {
              ...candidate,
              formula: formulaResult.source,
              canonicalFormula: formulaResult.canonical,
              type: formulaResult.inferredType ?? columnType ?? 'string',
            }
          : candidate,
      )
      const dependencyError = validateDependencyGraph(columnId, prospectiveColumns)
      if (dependencyError) return dependencyError

      get().saveSnapshot(`Edit formula column ${column.name}`)
      set((state) => {
        const currentNode = state.nodes[tableId]
        if (currentNode?.kind !== 'source_table' || !currentNode.schema) return
        const currentColumn = currentNode.schema.columns.find(candidate => candidate.id === columnId)
        if (!currentColumn?.isComputed) return
        currentColumn.formula = formulaResult.source
        currentColumn.canonicalFormula = formulaResult.canonical
        currentColumn.type = formulaResult.inferredType ?? columnType ?? 'string'
        currentNode.updatedAt = new Date().toISOString()
      })
      get().markNodeAndDescendantsDirty(tableId)
      return { ok: true, columnId } satisfies ColumnOperationResult
    },

    removeFormulaColumn: (tableId: string, columnId: string) => {
      const state = get()
      const node = state.nodes[tableId]
      if (!node || node.kind !== 'source_table' || !node.schema) {
        return { ok: false, code: 'TABLE_NOT_FOUND', error: 'Source table not found.' } satisfies ColumnOperationResult
      }
      const column = node.schema.columns.find(candidate => candidate.id === columnId)
      if (!column) {
        return { ok: false, code: 'COLUMN_NOT_FOUND', error: 'Column not found.' } satisfies ColumnOperationResult
      }
      if (!column.isComputed) {
        return { ok: false, code: 'NOT_COMPUTED', error: 'Only formula columns can be deleted here.' } satisfies ColumnOperationResult
      }

      const dependentColumns = node.schema.columns.filter(candidate =>
        candidate.id !== columnId &&
        candidate.isComputed &&
        getFormulaDependencies(candidate, node.schema!.columns).includes(columnId),
      )
      if (dependentColumns.length > 0) {
        return {
          ok: false,
          code: 'COLUMN_IN_USE',
          error: `Delete or update dependent formula column${dependentColumns.length === 1 ? '' : 's'} first: ${dependentColumns.map(candidate => `"${candidate.name}"`).join(', ')}.`,
        } satisfies ColumnOperationResult
      }

      const projectReferences = getProjectColumnReferences(state, tableId, column)
      if (projectReferences.length > 0) {
        return {
          ok: false,
          code: 'COLUMN_IN_USE',
          error: `Remove this column from ${projectReferences.join(', ')} before deleting it.`,
        } satisfies ColumnOperationResult
      }

      get().saveSnapshot(`Delete formula column ${column.name}`)
      set((draft) => {
        const currentNode = draft.nodes[tableId]
        if (currentNode?.kind !== 'source_table' || !currentNode.schema) return
        currentNode.schema.columns = currentNode.schema.columns.filter(candidate => candidate.id !== columnId)
        if (currentNode.viewFilters) {
          currentNode.viewFilters.conditions = currentNode.viewFilters.conditions.filter(
            condition => condition.columnId !== columnId,
          )
          if (currentNode.viewFilters.conditions.length === 0) {
            currentNode.viewFilters = undefined
          }
        }
        currentNode.updatedAt = new Date().toISOString()

        const patches = draft.patches[tableId]
        if (patches) {
          delete patches.cellPatches[columnId]
          patches.insertedRows.forEach(row => {
            delete row.values[columnId]
          })
          if (patches.highlightedCells) {
            patches.highlightedCells = new Set(
              [...patches.highlightedCells].filter(cell => !cell.endsWith(`:${columnId}`)),
            )
          }
        }
      })
      get().markNodeAndDescendantsDirty(tableId)
      return { ok: true, columnId } satisfies ColumnOperationResult
    },

    renameColumn: (tableId: string, columnId: string, newName: string) => {
      const node = get().nodes[tableId]
      if (!node || (node.kind !== 'source_table' && node.kind !== 'derived_table') || !node.schema) {
        return { ok: false, code: 'TABLE_NOT_FOUND', error: 'Table not found.' } satisfies ColumnOperationResult
      }
      if (!node.schema.columns.some((column) => column.id === columnId)) {
        return { ok: false, code: 'COLUMN_NOT_FOUND', error: 'Column not found.' } satisfies ColumnOperationResult
      }
      const nameResult = validateColumnName(node.schema.columns, newName, columnId)
      if (!nameResult.ok) return nameResult

      set((state) => {
        const currentNode = state.nodes[tableId]
        if (currentNode && (currentNode.kind === 'source_table' || currentNode.kind === 'derived_table')) {
          const tableNode = currentNode as SourceTableNode
          if (tableNode.schema) {
            const column = tableNode.schema.columns.find(c => c.id === columnId)
            if (column) {
              column.name = nameResult.name
              tableNode.updatedAt = new Date().toISOString()
            }
          }
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
      return { ok: true, columnId } satisfies ColumnOperationResult
    },
  }
}
