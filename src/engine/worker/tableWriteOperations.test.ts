import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as duckdb from '@duckdb/duckdb-wasm'
import { loadTable } from './tableWriteOperations'

const query = vi.fn()
const connection = { query } as unknown as duckdb.AsyncDuckDBConnection

describe('atomic table replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rolls back the replacement when a batch insertion fails', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO')) throw new Error('Invalid row')
      return {}
    })

    await expect(loadTable(connection, {
      tableId: 'sales " current',
      data: {
        columns: ['Amount'],
        columnIds: ['amount'],
        types: ['number'],
        rows: [[10]],
      },
    })).rejects.toThrow('Invalid row')

    const statements = query.mock.calls.map(([sql]) => sql as string)
    expect(statements[0]).toBe('BEGIN TRANSACTION')
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(statements.some((sql) =>
      sql.startsWith('DROP TABLE IF EXISTS "sales___current"')
    )).toBe(true)
  })

  it('commits only after all insertion batches succeed', async () => {
    query.mockResolvedValue({})

    await loadTable(connection, {
      tableId: 'sales',
      data: {
        columns: ['Amount'],
        columnIds: ['amount'],
        types: ['number'],
        rows: [[10], [20]],
      },
    })

    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(query).not.toHaveBeenCalledWith('ROLLBACK')
  })

  it('loads non-finite numeric snapshot values as explicit doubles', async () => {
    query.mockResolvedValue({})

    await loadTable(connection, {
      tableId: 'calculated',
      data: {
        columns: ['Value'],
        columnIds: ['value'],
        types: ['number'],
        rows: [[Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY]],
      },
    })

    const insert = query.mock.calls
      .map(([sql]) => sql as string)
      .find(sql => sql.startsWith('INSERT INTO'))
    expect(insert).toContain("CAST('NaN' AS DOUBLE)")
    expect(insert).toContain("CAST('Infinity' AS DOUBLE)")
    expect(insert).toContain("CAST('-Infinity' AS DOUBLE)")
  })

  it('converts DuckDB epoch dates before inserting snapshot rows', async () => {
    query.mockResolvedValue({})

    await loadTable(connection, {
      tableId: 'dated-copy',
      data: {
        columns: ['Date', 'Created at'],
        columnIds: ['date', 'created_at'],
        types: ['date', 'datetime'],
        rows: [[1704412800000, 1704412800000]],
      },
    })

    const insert = query.mock.calls
      .map(([sql]) => sql as string)
      .find(sql => sql.startsWith('INSERT INTO'))
    expect(insert).toContain("'2024-01-05'")
    expect(insert).toContain("'2024-01-05T00:00:00.000Z'")
  })
})
