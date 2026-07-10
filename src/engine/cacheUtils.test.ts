import { describe, expect, it, vi } from 'vitest'
import type { Patches } from '@/types'

vi.mock('./EngineAdapter', () => ({
  getEngine: vi.fn(),
}))

import { computePatchesVersion } from './cacheUtils'

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
