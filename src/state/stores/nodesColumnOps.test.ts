import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore, source } from '@/engine/integrationTestUtils'
import { evaluateComputedColumns } from '@/formula'
import { useProjectStore } from '@/state/projectStore'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  resetStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('column operations', () => {
  it('rejects duplicate display names case-insensitively without mutating schema', () => {
    const tableId = addSource('Source')
    const store = useProjectStore.getState()

    expect(store.addColumn(tableId, ' id ')).toMatchObject({
      ok: false,
      code: 'DUPLICATE_NAME',
    })
    expect(store.insertColumnAt(tableId, 'VALUE', 'string', 1)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_NAME',
    })
    expect(store.addFormulaColumn(tableId, 'value', '[ID]', 'string')).toMatchObject({
      ok: false,
      code: 'DUPLICATE_NAME',
    })
    expect(store.renameColumn(tableId, 'col2', 'iD')).toMatchObject({
      ok: false,
      code: 'DUPLICATE_NAME',
    })
    expect(source(tableId).schema?.columns.map(column => column.name)).toEqual(['ID', 'Value'])
  })

  it('stores a stable canonical formula while preserving readable source text', () => {
    const tableId = addSource('Source')
    const result = useProjectStore
      .getState()
      .addFormulaColumn(tableId, 'Double value', '[Value] * 2', 'number')

    expect(result.ok).toBe(true)
    const currentColumns = source(tableId).schema!.columns
    const formulaColumn = currentColumns[currentColumns.length - 1]
    expect(formulaColumn).toMatchObject({
      formula: '[Value] * 2',
      canonicalFormula: '[col2] * 2',
    })

    expect(useProjectStore.getState().renameColumn(tableId, 'col2', 'Net value ($)')).toMatchObject({
      ok: true,
    })
    const evaluated = evaluateComputedColumns(
      [{ __rowId: 'row-1', col1: 'a', col2: 7 }],
      source(tableId).schema!.columns,
    )
    expect(evaluated.rows[0][formulaColumn.id]).toBe(14)
  })

  it('returns an error and does not add malformed formulas', () => {
    const tableId = addSource('Source')
    const result = useProjectStore
      .getState()
      .addFormulaColumn(tableId, 'Broken', '[Value', 'number')

    expect(result).toMatchObject({ ok: false, code: 'INVALID_FORMULA' })
    expect(source(tableId).schema?.columns).toHaveLength(2)
  })

  it('edits formulas with stable references, inferred types, dirty propagation, and undo', () => {
    const tableId = addSource('Source')
    const store = useProjectStore.getState()
    const added = store.addFormulaColumn(tableId, 'Computed', '[Value] * 2', 'number')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const derivedId = store.addDerivedTable({
      name: 'Downstream',
      transformDef: { type: 'filter', sourceTableId: tableId, conditions: [], logic: 'and' },
      upstreamNodeIds: [tableId],
    })
    useProjectStore.setState(state => ({
      nodes: {
        ...state.nodes,
        [tableId]: { ...state.nodes[tableId], cacheInfo: { isDirty: false } },
        [derivedId]: { ...state.nodes[derivedId], cacheInfo: { isDirty: false } },
      },
    }))

    expect(useProjectStore.getState().updateFormulaColumn(
      tableId,
      added.columnId,
      '[Value] > 10',
      'number',
    )).toEqual({ ok: true, columnId: added.columnId })
    expect(source(tableId).schema?.columns.find(column => column.id === added.columnId)).toMatchObject({
      formula: '[Value] > 10',
      canonicalFormula: '[col2] > 10',
      type: 'boolean',
    })
    const currentSource = useProjectStore.getState().nodes[tableId]
    const currentDerived = useProjectStore.getState().nodes[derivedId]
    expect(currentSource.kind === 'source_table' && currentSource.cacheInfo?.isDirty).toBe(true)
    expect(currentDerived.kind === 'derived_table' && currentDerived.cacheInfo?.isDirty).toBe(true)

    useProjectStore.getState().undo()
    expect(source(tableId).schema?.columns.find(column => column.id === added.columnId)).toMatchObject({
      formula: '[Value] * 2',
      type: 'number',
    })
  })

  it('rejects self and circular computed-column dependencies without mutation', () => {
    const tableId = addSource('Source')
    const store = useProjectStore.getState()
    const first = store.addFormulaColumn(tableId, 'First', '[Value] * 2', 'number')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = store.addFormulaColumn(tableId, 'Second', '[First] + 1', 'number')
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(store.updateFormulaColumn(tableId, first.columnId, '[First] + 1')).toMatchObject({
      ok: false,
      code: 'CIRCULAR_DEPENDENCY',
      error: expect.stringContaining('itself'),
    })
    expect(store.updateFormulaColumn(tableId, first.columnId, '[Second] + 1')).toMatchObject({
      ok: false,
      code: 'CIRCULAR_DEPENDENCY',
    })
    expect(source(tableId).schema?.columns.find(column => column.id === first.columnId)?.formula)
      .toBe('[Value] * 2')
  })

  it('blocks referenced deletions and cleans local column state when safe', () => {
    const tableId = addSource('Source')
    const store = useProjectStore.getState()
    const first = store.addFormulaColumn(tableId, 'First', '[Value] * 2', 'number')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const dependent = store.addFormulaColumn(tableId, 'Dependent', '[First] + 1', 'number')
    expect(dependent.ok).toBe(true)
    if (!dependent.ok) return

    expect(store.removeFormulaColumn(tableId, first.columnId)).toMatchObject({
      ok: false,
      code: 'COLUMN_IN_USE',
      error: expect.stringContaining('Dependent'),
    })
    expect(store.removeFormulaColumn(tableId, dependent.columnId)).toMatchObject({ ok: true })

    useProjectStore.setState(state => {
      const table = state.nodes[tableId]
      if (table.kind === 'source_table') {
        table.viewFilters = {
          conditions: [{ columnId: first.columnId, operator: 'equals', value: 2 }],
          logic: 'and',
        }
      }
      state.patches[tableId] = {
        cellPatches: { [first.columnId]: { row1: 2 } },
        deletedRows: new Set(),
        insertedRows: [{ rowId: 'new', insertedAt: 0, values: { [first.columnId]: 2 } }],
        highlightedCells: new Set([`row1:${first.columnId}`]),
      }
    })
    expect(useProjectStore.getState().removeFormulaColumn(tableId, first.columnId)).toMatchObject({
      ok: true,
    })
    expect(source(tableId).schema?.columns.some(column => column.id === first.columnId)).toBe(false)
    expect(source(tableId).viewFilters).toBeUndefined()
    expect(useProjectStore.getState().patches[tableId].cellPatches[first.columnId]).toBeUndefined()
    expect(useProjectStore.getState().patches[tableId].insertedRows[0].values[first.columnId]).toBeUndefined()
    expect(useProjectStore.getState().patches[tableId].highlightedCells).toEqual(new Set())
  })

  it('blocks deleting a formula column used by a chart', () => {
    const tableId = addSource('Source')
    const store = useProjectStore.getState()
    const added = store.addFormulaColumn(tableId, 'Computed', '[Value] * 2', 'number')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    store.addChart({
      name: 'Computed chart',
      position: { x: 0, y: 0 },
      plan: {
        chartType: 'bar',
        sourceTableId: tableId,
        config: { xAxis: 'col1', yAxis: added.columnId },
      },
    })

    expect(store.removeFormulaColumn(tableId, added.columnId)).toMatchObject({
      ok: false,
      code: 'COLUMN_IN_USE',
      error: expect.stringContaining('Computed chart'),
    })
  })
})
