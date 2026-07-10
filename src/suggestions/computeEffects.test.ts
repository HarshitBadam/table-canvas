import { describe, expect, it } from 'vitest'
import { computeCombinedSuggestionEffect, computeSuggestionEffect } from './computeEffects'
import type { CleaningOperation, Suggestion } from '@/types'
import type { TableRow } from '@/state/dataStore'

function createSuggestion(operation: CleaningOperation): Suggestion {
  return {
    id: `test:${operation.type}`,
    category: 'cleaning',
    scope: 'column',
    title: 'Test cleaning operation',
    confidence: 'high',
    context: {
      tableId: 'table',
      columnId: 'value',
      tableVersionHash: 'version',
      cleaningOperation: operation,
    },
    action: {
      kind: 'applyPatch',
      ops: [],
      target: 'source',
    },
  }
}

describe('computeSuggestionEffect', () => {
  it('fills missing strings without changing populated values', () => {
    const rows: TableRow[] = [
      { __rowId: '1', value: null },
      { __rowId: '2', value: '' },
      { __rowId: '3', value: 'Present' },
    ]

    const effect = computeSuggestionEffect(
      createSuggestion({ type: 'fill_missing_string', value: 'Unknown' }),
      rows,
    )

    expect(effect.changes).toEqual([
      { rowId: '1', columnId: 'value', oldValue: null, newValue: 'Unknown' },
      { rowId: '2', columnId: 'value', oldValue: '', newValue: 'Unknown' },
    ])
  })

  it('uses the supplied median for numeric imputation', () => {
    const rows: TableRow[] = [
      { __rowId: '1', value: null },
      { __rowId: '2', value: 10 },
      { __rowId: '3', value: 30 },
    ]

    const effect = computeSuggestionEffect(
      createSuggestion({ type: 'fill_missing_numeric', strategy: 'median' }),
      rows,
      20,
    )

    expect(effect.changes[0]?.newValue).toBe(20)
  })

  it('standardizes recognized date strings to ISO dates', () => {
    const rows: TableRow[] = [
      { __rowId: '1', value: 'Jan 5, 2026' },
      { __rowId: '2', value: 'not a date' },
    ]

    const effect = computeSuggestionEffect(
      createSuggestion({ type: 'standardize_date', outputFormat: '%Y-%m-%d' }),
      rows,
    )

    expect(effect.changes).toEqual([
      { rowId: '1', columnId: 'value', oldValue: 'Jan 5, 2026', newValue: '2026-01-05' },
    ])
  })

  it('converts epoch seconds to an ISO date', () => {
    const rows: TableRow[] = [
      { __rowId: '1', value: 1_767_225_600 },
    ]

    const effect = computeSuggestionEffect(
      createSuggestion({ type: 'epoch_to_date', unit: 'seconds' }),
      rows,
    )

    expect(effect.changes[0]?.newValue).toBe('2026-01-01')
  })

  it('composes multiple fixes that target the same cell', () => {
    const rows: TableRow[] = [{ __rowId: '1', value: '  MiXeD  ' }]

    const effect = computeCombinedSuggestionEffect([
      createSuggestion({ type: 'trim' }),
      createSuggestion({
        type: 'normalize_case',
        mappings: { '  MiXeD  ': 'mixed' },
      }),
    ], rows)

    expect(effect.changes).toEqual([
      {
        rowId: '1',
        columnId: 'value',
        oldValue: '  MiXeD  ',
        newValue: 'mixed',
      },
    ])
    expect(rows[0].value).toBe('  MiXeD  ')
  })

  it('applies placeholder nullification after other selected fixes', () => {
    const rows: TableRow[] = [{ __rowId: '1', value: ' N/A ' }]

    const effect = computeCombinedSuggestionEffect([
      createSuggestion({ type: 'trim' }),
      createSuggestion({ type: 'nullify_placeholders', placeholders: ['N/A'] }),
    ], rows)

    expect(effect.changes[0]).toMatchObject({
      oldValue: ' N/A ',
      newValue: null,
    })
  })

  it('does not refill values removed by a selected outlier fix', () => {
    const rows: TableRow[] = [{ __rowId: '1', value: 100 }]

    const effect = computeCombinedSuggestionEffect([
      createSuggestion({ type: 'remove_outliers', lowerBound: 0, upperBound: 10 }),
      createSuggestion({ type: 'fill_missing_numeric', strategy: 'zero' }),
    ], rows)

    expect(effect.changes[0]).toMatchObject({
      oldValue: 100,
      newValue: null,
    })
  })
})
