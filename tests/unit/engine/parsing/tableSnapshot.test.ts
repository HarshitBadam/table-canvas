import { describe, expect, it } from 'vitest'
import type { TableRow } from '@/state/dataStore'
import type { TableSchema } from '@/types'
import { createTableSnapshot, parseTableSnapshot } from '@/engine/parsing/tableSnapshot'

const schema: TableSchema = {
  columns: [
    {
      id: 'amount',
      name: 'Amount',
      type: 'number',
      nullable: false,
      isComputed: true,
      formula: '[price] * 2',
      canonicalFormula: '[price] * 2',
      duckDbName: 'Amount',
    },
    {
      id: 'active',
      name: 'Active',
      type: 'boolean',
      nullable: true,
    },
  ],
  rowCount: 2,
}

describe('table snapshots', () => {
  it('preserves typed values and converts computed columns into plain source columns', () => {
    const rows: TableRow[] = [
      { __rowId: 'derived_1', amount: 12.5, active: true },
      { __rowId: 'derived_2', amount: null, active: false },
    ]

    const snapshot = createTableSnapshot(schema, rows)
    const restored = parseTableSnapshot(toArrayBuffer(snapshot.bytes), snapshot.schema)

    expect(snapshot.schema.rowCount).toBe(2)
    expect(snapshot.schema.columns).toEqual([
      expect.objectContaining({ name: 'Amount', type: 'number', nullable: false }),
      expect.objectContaining({ name: 'Active', type: 'boolean', nullable: true }),
    ])
    expect(snapshot.schema.columns[0]).not.toHaveProperty('isComputed')
    expect(snapshot.schema.columns[0]).not.toHaveProperty('formula')
    expect(new Set(snapshot.schema.columns.map(column => column.id)).size).toBe(2)
    expect(restored).toEqual([
      {
        __rowId: 'row_0',
        [snapshot.schema.columns[0].id]: 12.5,
        [snapshot.schema.columns[1].id]: true,
      },
      {
        __rowId: 'row_1',
        [snapshot.schema.columns[0].id]: null,
        [snapshot.schema.columns[1].id]: false,
      },
    ])
  })

  it('deduplicates names and column ids from problematic derived schemas', () => {
    const duplicateSchema: TableSchema = {
      columns: [
        {
          id: 'value',
          name: 'Value',
          duckDbName: 'Left Value',
          type: 'string',
          nullable: true,
        },
        {
          id: 'value',
          name: 'value',
          duckDbName: 'Right Value',
          type: 'string',
          nullable: true,
        },
      ],
    }
    const snapshot = createTableSnapshot(
      duplicateSchema,
      [{
        __rowId: 'row',
        'Left Value': 'left',
        'Right Value': 'right',
      }],
    )
    const restored = parseTableSnapshot(
      toArrayBuffer(snapshot.bytes),
      snapshot.schema,
    )

    expect(snapshot.schema.columns.map(column => column.name)).toEqual([
      'Value',
      'value (2)',
    ])
    expect(new Set(snapshot.schema.columns.map(column => column.id)).size).toBe(2)
    expect(restored[0][snapshot.schema.columns[0].id]).toBe('left')
    expect(restored[0][snapshot.schema.columns[1].id]).toBe('right')
  })

  it('preserves non-finite calculated numbers', () => {
    const numericSchema: TableSchema = {
      columns: [{ id: 'value', name: 'Value', type: 'number', nullable: true }],
    }
    const snapshot = createTableSnapshot(numericSchema, [
      { __rowId: 'one', value: Number.NaN },
      { __rowId: 'two', value: Number.POSITIVE_INFINITY },
      { __rowId: 'three', value: Number.NEGATIVE_INFINITY },
    ])
    const restored = parseTableSnapshot(toArrayBuffer(snapshot.bytes), snapshot.schema)
    const columnId = snapshot.schema.columns[0].id

    expect(Number.isNaN(restored[0][columnId])).toBe(true)
    expect(restored[1][columnId]).toBe(Number.POSITIVE_INFINITY)
    expect(restored[2][columnId]).toBe(Number.NEGATIVE_INFINITY)
  })

  it('rejects malformed and schema-mismatched snapshot files', () => {
    const invalid = new TextEncoder().encode('{"version":2}')
    expect(() => parseTableSnapshot(toArrayBuffer(invalid), schema))
      .toThrow('invalid or unsupported format')

    const snapshot = createTableSnapshot(schema, [])
    expect(() => parseTableSnapshot(toArrayBuffer(snapshot.bytes), schema))
      .toThrow('columns do not match')
  })
})

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}
