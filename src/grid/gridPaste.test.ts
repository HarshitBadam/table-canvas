import { describe, expect, it } from 'vitest'
import type { ColumnSchema } from '@/types'
import { createGridPastePlan, describePasteSkips, parseTabularClipboard } from './gridPaste'

const columns: ColumnSchema[] = [
  { id: 'name', name: 'Name', type: 'string', nullable: true },
  { id: 'amount', name: 'Amount', type: 'number', nullable: true },
  { id: 'active', name: 'Active', type: 'boolean', nullable: true },
  { id: 'computed', name: 'Computed', type: 'number', nullable: true, isComputed: true },
]

const rows = [
  { __rowId: 'row-1', name: '', amount: '', active: '', computed: 0 },
  { __rowId: 'row-2', name: '', amount: '', active: '', computed: 0 },
]

describe('parseTabularClipboard', () => {
  it('parses CRLF rows, tabs, and a trailing newline', () => {
    expect(parseTabularClipboard('Alpha\t1\r\nBeta\t2\r\n')).toEqual([
      ['Alpha', '1'],
      ['Beta', '2'],
    ])
  })

  it('preserves quoted tabs, newlines, and escaped quotes', () => {
    expect(parseTabularClipboard('"Alpha\tBeta"\t"line 1\nline 2"\t"He said ""yes"""')).toEqual([
      ['Alpha\tBeta', 'line 1\nline 2', 'He said "yes"'],
    ])
  })
})

describe('createGridPastePlan', () => {
  it('coerces typed values and creates rectangular changes', () => {
    const plan = createGridPastePlan({
      text: 'Alpha\t1,250\tYes\nBeta\t-3.5\t0',
      startRow: 0,
      startColIndex: 0,
      rows,
      columns,
    })

    expect(plan).toMatchObject({
      invalidCount: 0,
      readOnlyCount: 0,
      outOfBoundsCount: 0,
    })
    expect(plan.changes.map(change => change.value)).toEqual([
      'Alpha', 1250, 'True',
      'Beta', -3.5, 'False',
    ])
  })

  it('skips invalid, computed, and out-of-bounds cells without discarding valid cells', () => {
    const plan = createGridPastePlan({
      text: '100\tYes\tignored\textra\nnot-a-number',
      startRow: 0,
      startColIndex: 1,
      rows,
      columns,
    })

    expect(plan.changes.map(change => change.value)).toEqual([100, 'True'])
    expect(plan.invalidCount).toBe(1)
    expect(plan.readOnlyCount).toBe(1)
    expect(plan.outOfBoundsCount).toBe(1)
    expect(describePasteSkips(plan)).toBe('1 invalid, 1 read-only, 1 outside the table')
  })
})
