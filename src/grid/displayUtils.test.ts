import { describe, expect, it } from 'vitest'
import type { ColumnSchema } from '@/types'
import type { TableRow } from '@/state/dataStore'
import { computeDisplayValue } from './displayUtils'

describe('computeDisplayValue', () => {
  it('evaluates chained computed columns with patched base values', () => {
    const columns: ColumnSchema[] = [
      { id: 'price', name: 'Price', type: 'number', nullable: true },
      { id: 'quantity', name: 'Quantity', type: 'number', nullable: true },
      {
        id: 'total',
        name: 'Total',
        type: 'number',
        nullable: true,
        formula: '[Price] * [Quantity]',
        isComputed: true,
      },
      {
        id: 'tax',
        name: 'Tax',
        type: 'number',
        nullable: true,
        formula: '[Total] * 0.1',
        isComputed: true,
      },
    ]
    const row: TableRow = {
      __rowId: 'row-1',
      price: 100,
      quantity: 2,
      total: 200,
      tax: 20,
    }

    expect(
      computeDisplayValue('row-1', 'tax', 20, row, columns, {
        quantity: { 'row-1': 3 },
      }),
    ).toBe(30)
  })

  it('returns a consistent error marker for cycles and evaluation failures', () => {
    const cyclic: ColumnSchema[] = [
      {
        id: 'a',
        name: 'A',
        type: 'number',
        nullable: true,
        formula: '[B] + 1',
        isComputed: true,
      },
      {
        id: 'b',
        name: 'B',
        type: 'number',
        nullable: true,
        formula: '[A] + 1',
        isComputed: true,
      },
    ]
    const row: TableRow = { __rowId: 'row-1', a: 1, b: 2 }
    expect(computeDisplayValue('row-1', 'a', 1, row, cyclic)).toBe('#ERROR')

    const divideByZero: ColumnSchema[] = [
      { id: 'quantity', name: 'Quantity', type: 'number', nullable: true },
      {
        id: 'unit',
        name: 'Unit',
        type: 'number',
        nullable: true,
        formula: '10 / [Quantity]',
        isComputed: true,
      },
    ]
    expect(
      computeDisplayValue(
        'row-1',
        'unit',
        null,
        { __rowId: 'row-1', quantity: 0, unit: null },
        divideByZero,
      ),
    ).toBe('#ERROR')
  })
})
