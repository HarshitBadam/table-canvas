import { describe, expect, it, vi } from 'vitest'
import type { Patches, TableSchema } from '@/types'

vi.mock('./EngineAdapter', () => ({
  getEngine: vi.fn(),
}))

import {
  computePatchesVersion,
  computeSchemaFingerprint,
  computeSourceVersionHash,
} from './cacheUtils'

function patches(value: string): Patches {
  return {
    cellPatches: { column: { row_1: value } },
    deletedRows: new Set(),
    insertedRows: [],
    highlightedCells: new Set(),
  }
}

describe('computePatchesVersion', () => {
  it('changes when a patched value changes without changing patch counts', () => {
    expect(computePatchesVersion(patches('before'))).not.toBe(
      computePatchesVersion(patches('after')),
    )
  })

  it('does not depend on object or Set insertion order', () => {
    const first: Patches = {
      cellPatches: { b: { row_2: 2 }, a: { row_1: 1 } },
      deletedRows: new Set(['row_2', 'row_1']),
      insertedRows: [],
    }
    const second: Patches = {
      cellPatches: { a: { row_1: 1 }, b: { row_2: 2 } },
      deletedRows: new Set(['row_1', 'row_2']),
      insertedRows: [],
    }
    expect(computePatchesVersion(first)).toBe(computePatchesVersion(second))
  })
})

describe('source schema versioning', () => {
  const schema: TableSchema = {
    columns: [{
      id: 'amount',
      name: 'Amount',
      sourceName: 'raw_amount',
      duckDbName: 'Amount',
      type: 'number',
      nullable: true,
      isComputed: false,
    }],
  }

  it('changes source versions for schema-only changes', () => {
    const original = computeSourceVersionHash(
      'table',
      'file',
      'patches',
      computeSchemaFingerprint(schema),
    )
    const renamed = computeSourceVersionHash(
      'table',
      'file',
      'patches',
      computeSchemaFingerprint({
        ...schema,
        columns: [{ ...schema.columns[0], name: 'Total' }],
      }),
    )
    const computed = computeSourceVersionHash(
      'table',
      'file',
      'patches',
      computeSchemaFingerprint({
        ...schema,
        columns: [{
          ...schema.columns[0],
          isComputed: true,
          formula: '[Amount] * 2',
        }],
      }),
    )

    expect(new Set([original, renamed, computed])).toHaveLength(3)
  })

  it('is deterministic for equivalent schema copies', () => {
    expect(computeSchemaFingerprint(schema)).toBe(
      computeSchemaFingerprint(structuredClone(schema)),
    )
  })
})
