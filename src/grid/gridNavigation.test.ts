import { describe, expect, it } from 'vitest'
import type { ColumnSchema } from '@/types'
import { getEditableCellsInSelection, getNavigationTarget } from './gridNavigation'

describe('getNavigationTarget', () => {
  it('moves Enter vertically and reverses with Shift', () => {
    expect(getNavigationTarget({ rowIndex: 2, colIndex: 1 }, 'Enter', 5, 3))
      .toEqual({ rowIndex: 3, colIndex: 1 })
    expect(getNavigationTarget({ rowIndex: 2, colIndex: 1 }, 'Enter', 5, 3, true))
      .toEqual({ rowIndex: 1, colIndex: 1 })
  })

  it('wraps Tab across rows in either direction', () => {
    expect(getNavigationTarget({ rowIndex: 1, colIndex: 2 }, 'Tab', 4, 3))
      .toEqual({ rowIndex: 2, colIndex: 0 })
    expect(getNavigationTarget({ rowIndex: 2, colIndex: 0 }, 'Tab', 4, 3, true))
      .toEqual({ rowIndex: 1, colIndex: 2 })
  })

  it('keeps arrow navigation within the data cells', () => {
    expect(getNavigationTarget({ rowIndex: 0, colIndex: 0 }, 'ArrowUp', 4, 3))
      .toEqual({ rowIndex: 0, colIndex: 0 })
    expect(getNavigationTarget({ rowIndex: 3, colIndex: 2 }, 'ArrowRight', 4, 3))
      .toEqual({ rowIndex: 3, colIndex: 2 })
  })
})

describe('getEditableCellsInSelection', () => {
  const columns: ColumnSchema[] = [
    { id: 'name', name: 'Name', type: 'string', nullable: true },
    { id: 'computed', name: 'Computed', type: 'number', nullable: true, isComputed: true },
    { id: 'amount', name: 'Amount', type: 'number', nullable: true },
  ]
  const rows = [{ __rowId: 'row-1' }, { __rowId: 'row-2' }]

  it('returns every editable cell in a range and skips computed columns', () => {
    expect(getEditableCellsInSelection(0, 0, {
      startRow: 0,
      endRow: 1,
      startColIndex: 0,
      endColIndex: 2,
    }, rows, columns)).toEqual([
      { rowId: 'row-1', columnId: 'name' },
      { rowId: 'row-1', columnId: 'amount' },
      { rowId: 'row-2', columnId: 'name' },
      { rowId: 'row-2', columnId: 'amount' },
    ])
  })
})
