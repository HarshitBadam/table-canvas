import { describe, expect, it } from 'vitest'
import type { ColumnSchema } from '@/types'
import { evaluateComputedColumns } from './computedColumns'

const columns: ColumnSchema[] = [
  { id: 'price', name: 'price', type: 'number', nullable: true },
  { id: 'quantity', name: 'quantity', type: 'number', nullable: true },
  {
    id: 'total',
    name: 'total',
    type: 'number',
    nullable: true,
    formula: '[price] * [quantity]',
    isComputed: true,
  },
]

describe('evaluateComputedColumns', () => {
  it('evaluates computed columns from the same row', () => {
    const result = evaluateComputedColumns([
      { __rowId: 'row-1', price: 950, quantity: 25 },
      { __rowId: 'row-2', price: 15, quantity: 150 },
    ], columns)

    expect(result.errors).toEqual([])
    expect(result.rows.map((row) => row.total)).toEqual([23750, 2250])
  })

  it('evaluates computed columns after upstream computed dependencies', () => {
    const dependentColumns = [
      ...columns,
      {
        id: 'tax',
        name: 'tax',
        type: 'number',
        nullable: true,
        formula: '[total] * 0.1',
        isComputed: true,
      } satisfies ColumnSchema,
    ]

    const result = evaluateComputedColumns([
      { __rowId: 'row-1', price: 100, quantity: 2 },
    ], dependentColumns)

    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({ total: 200, tax: 20 })
  })

  it('keeps materialization alive when a row cannot evaluate', () => {
    const result = evaluateComputedColumns([
      { __rowId: 'row-1', price: 100, quantity: 0 },
      { __rowId: 'row-2', price: 100, quantity: null },
    ], [
      ...columns,
      {
        id: 'unit',
        name: 'unit',
        type: 'number',
        nullable: true,
        formula: '[price] / [quantity]',
        isComputed: true,
      } satisfies ColumnSchema,
    ])

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].unit).toBeNull()
    expect(result.rows[1].unit).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ rowId: 'row-1', columnId: 'unit' })
  })

  it('uses canonical IDs after a referenced column is renamed', () => {
    const renamedColumns: ColumnSchema[] = [
      { id: 'price', name: 'Unit price ($)', type: 'number', nullable: true },
      {
        id: 'double',
        name: 'Double',
        type: 'number',
        nullable: true,
        formula: '[price] * 2',
        canonicalFormula: '[price] * 2',
        isComputed: true,
      },
    ]

    const result = evaluateComputedColumns([{ __rowId: 'row-1', price: 12 }], renamedColumns)
    expect(result.errors).toEqual([])
    expect(result.rows[0].double).toBe(24)
  })

  it('reports cycles without throwing or returning stale computed values', () => {
    const cyclicColumns: ColumnSchema[] = [
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

    const result = evaluateComputedColumns(
      [{ __rowId: 'row-1', a: 10, b: 20 }],
      cyclicColumns,
    )
    expect(result.rows[0]).toMatchObject({ a: null, b: null })
    expect(result.errors.map(error => error.columnId).sort()).toEqual(['a', 'b'])
    expect(result.errors.every(error => error.message.includes('Circular'))).toBe(true)
  })
})
