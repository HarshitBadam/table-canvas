import { describe, expect, it } from 'vitest'
import type { ColumnSchema } from '@/types'
import { validateComputedColumnSchema } from './EngineAdapter'

const base: ColumnSchema = {
  id: 'amount',
  name: 'Amount',
  type: 'number',
  nullable: true,
}

describe('computed column materialization validation', () => {
  it('rejects computed columns without formulas', () => {
    expect(() => validateComputedColumnSchema([
      base,
      { ...base, id: 'total', name: 'Total', isComputed: true },
    ])).toThrow('formula is required')
  })

  it('rejects unknown column references with an actionable message', () => {
    expect(() => validateComputedColumnSchema([
      base,
      {
        ...base,
        id: 'total',
        name: 'Total',
        isComputed: true,
        formula: '[Missing] * 2',
      },
    ])).toThrow('unknown column "Missing"')
  })

  it('rejects circular computed dependencies before loading rows', () => {
    expect(() => validateComputedColumnSchema([
      {
        ...base,
        id: 'a',
        name: 'A',
        isComputed: true,
        formula: '[B] + 1',
      },
      {
        ...base,
        id: 'b',
        name: 'B',
        isComputed: true,
        formula: '[A] + 1',
      },
    ])).toThrow('Circular formula dependency')
  })
})
