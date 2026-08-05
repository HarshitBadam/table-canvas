import { describe, expect, it, vi } from 'vitest'
import type * as duckdb from '@duckdb/duckdb-wasm'
import { executeTransform } from '@/engine/worker/transforms'

describe('atomic transform cancellation', () => {
  it('rolls back a materialized table when cancellation arrives before commit', async () => {
    const query = vi.fn().mockResolvedValue({ toArray: () => [] })
    const connection = { query } as unknown as duckdb.AsyncDuckDBConnection
    const checkpoint = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Worker mutation cancelled'))

    await expect(executeTransform(connection, {
      type: 'filter',
      sourceTableId: 'source',
      outputTableId: 'derived',
      conditions: [],
      logic: 'and',
    }, checkpoint)).rejects.toThrow('Worker mutation cancelled')

    expect(query).toHaveBeenCalledWith('BEGIN TRANSACTION')
    expect(query).toHaveBeenCalledWith('ROLLBACK')
    expect(query).not.toHaveBeenCalledWith('COMMIT')
  })

  it('rolls back instead of committing when the finalize-commit handshake is denied after every checkpoint passes', async () => {
    const query = vi.fn().mockResolvedValue({ toArray: () => [] })
    const connection = { query } as unknown as duckdb.AsyncDuckDBConnection
    const checkpoint = vi.fn().mockResolvedValue(undefined)
    const onFinalizeCommit = vi.fn().mockRejectedValue(new Error('Worker mutation cancelled'))

    await expect(executeTransform(connection, {
      type: 'filter',
      sourceTableId: 'source',
      outputTableId: 'derived',
      conditions: [],
      logic: 'and',
    }, checkpoint, onFinalizeCommit)).rejects.toThrow('Worker mutation cancelled')

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith('BEGIN TRANSACTION')
    expect(query).toHaveBeenCalledWith('ROLLBACK')
    expect(query).not.toHaveBeenCalledWith('COMMIT')
  })

  it('commits only once every checkpoint and the finalize-commit handshake are granted', async () => {
    const query = vi.fn().mockResolvedValue({ toArray: () => [] })
    const connection = { query } as unknown as duckdb.AsyncDuckDBConnection
    const checkpoint = vi.fn().mockResolvedValue(undefined)
    const onFinalizeCommit = vi.fn().mockResolvedValue(undefined)

    await executeTransform(connection, {
      type: 'filter',
      sourceTableId: 'source',
      outputTableId: 'derived',
      conditions: [],
      logic: 'and',
    }, checkpoint, onFinalizeCommit)

    expect(onFinalizeCommit).toHaveBeenCalledOnce()
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(query).not.toHaveBeenCalledWith('ROLLBACK')
  })
})
