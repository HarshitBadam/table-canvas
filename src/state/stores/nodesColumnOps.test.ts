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
})
