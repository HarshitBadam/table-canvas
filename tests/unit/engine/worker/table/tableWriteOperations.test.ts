import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as duckdb from '@duckdb/duckdb-wasm'
import {
  loadTable,
  updateCell,
  insertRow,
  deleteRow,
  dropTable,
} from '@/engine/worker/table/tableWriteOperations'

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

  it('rolls back instead of committing when cancellation reaches a batch checkpoint', async () => {
    query.mockResolvedValue({})
    const cancellationCheckpoint = vi.fn().mockRejectedValue(
      new Error('Worker mutation cancelled'),
    )

    await expect(loadTable(connection, {
      tableId: 'cancelled-import',
      data: {
        columns: ['Amount'],
        columnIds: ['amount'],
        types: ['number'],
        rows: [[10]],
      },
    }, cancellationCheckpoint)).rejects.toThrow('Worker mutation cancelled')

    expect(cancellationCheckpoint).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith('ROLLBACK')
    expect(query).not.toHaveBeenCalledWith('COMMIT')
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

  it('rolls back instead of committing when the finalize-commit handshake is denied', async () => {
    query.mockResolvedValue({})
    const onFinalizeCommit = vi.fn().mockRejectedValue(new Error('Worker mutation cancelled'))

    await expect(loadTable(connection, {
      tableId: 'denied-at-commit',
      data: {
        columns: ['Amount'],
        columnIds: ['amount'],
        types: ['number'],
        rows: [[10]],
      },
    }, undefined, onFinalizeCommit)).rejects.toThrow('Worker mutation cancelled')

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith('ROLLBACK')
    expect(query).not.toHaveBeenCalledWith('COMMIT')
  })

  it('commits only after the finalize-commit handshake is granted', async () => {
    query.mockResolvedValue({})
    const onFinalizeCommit = vi.fn().mockResolvedValue(undefined)

    await loadTable(connection, {
      tableId: 'granted-at-commit',
      data: {
        columns: ['Amount'],
        columnIds: ['amount'],
        types: ['number'],
        rows: [],
      },
    }, undefined, onFinalizeCommit)

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    const commitIndex = query.mock.calls.findIndex(([sql]) => sql === 'COMMIT')
    expect(commitIndex).toBeGreaterThan(-1)
    expect(query).not.toHaveBeenCalledWith('ROLLBACK')
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

describe('atomic single-statement mutations honor the finalize-commit handshake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({})
  })

  it('never executes UPDATE when the finalize-commit handshake is denied', async () => {
    const onFinalizeCommit = vi.fn().mockRejectedValue(new Error('Worker mutation cancelled'))

    await expect(
      updateCell(connection, 'sales', 'row_1', 'Amount', 5, 'number', onFinalizeCommit),
    ).rejects.toThrow('Worker mutation cancelled')

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query).not.toHaveBeenCalled()
  })

  it('never executes INSERT when the finalize-commit handshake is denied', async () => {
    const onFinalizeCommit = vi.fn().mockRejectedValue(new Error('Worker mutation cancelled'))

    await expect(
      insertRow(connection, 'sales', { Amount: 5 }, ['Amount'], ['number'], onFinalizeCommit),
    ).rejects.toThrow('Worker mutation cancelled')

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query).not.toHaveBeenCalled()
  })

  it('never executes DELETE when the finalize-commit handshake is denied', async () => {
    const onFinalizeCommit = vi.fn().mockRejectedValue(new Error('Worker mutation cancelled'))

    await expect(
      deleteRow(connection, 'sales', 0, onFinalizeCommit),
    ).rejects.toThrow('Worker mutation cancelled')

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query).not.toHaveBeenCalled()
  })

  it('never executes DROP TABLE when the finalize-commit handshake is denied', async () => {
    const onFinalizeCommit = vi.fn().mockRejectedValue(new Error('Worker mutation cancelled'))

    await expect(
      dropTable(connection, 'sales', onFinalizeCommit),
    ).rejects.toThrow('Worker mutation cancelled')

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query).not.toHaveBeenCalled()
  })

  it('executes the statement once the finalize-commit handshake is granted', async () => {
    const onFinalizeCommit = vi.fn().mockResolvedValue(undefined)

    await updateCell(connection, 'sales', 'row_1', 'Amount', 5, 'number', onFinalizeCommit)

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "sales"'))
  })
})
