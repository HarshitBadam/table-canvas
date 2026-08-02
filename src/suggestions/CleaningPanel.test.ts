import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTableData = vi.hoisted(() => vi.fn())

vi.mock('@/engine/tableDataService', () => ({ getTableData }))

import { loadCleaningPreview, loadCleaningRows } from './cleaningRows'

beforeEach(() => {
  getTableData.mockReset()
})

describe('loadCleaningPreview', () => {
  it('returns a bounded preview and policy flag for oversized tables', async () => {
    getTableData.mockResolvedValue({
      rows: [{ __rowId: '1', value: 'sample' }],
      totalRows: 100_001,
    })

    await expect(loadCleaningPreview('table')).resolves.toEqual({
      rows: [{ __rowId: '1', value: 'sample' }],
      totalRows: 100_001,
      isTruncated: true,
      isPolicyLimited: true,
    })
    expect(getTableData).toHaveBeenCalledWith('table', 0, 1_000)
  })
})

describe('loadCleaningRows', () => {
  it('surfaces a materialization error instead of treating it as an empty table', async () => {
    getTableData.mockResolvedValue({
      rows: [],
      totalRows: 0,
      error: 'Workbook data is unavailable',
    })

    await expect(loadCleaningRows('table')).rejects.toThrow('Workbook data is unavailable')
  })

  it('surfaces an error from the full-table fetch', async () => {
    getTableData
      .mockResolvedValueOnce({
        rows: [],
        totalRows: 2,
      })
      .mockResolvedValueOnce({
        rows: [],
        totalRows: 0,
        error: 'Could not read the remaining rows',
      })

    await expect(loadCleaningRows('table')).rejects.toThrow(
      'Could not read the remaining rows',
    )
  })

  it('loads the complete table after a zero-limit preflight', async () => {
    const completeRows = [
      { __rowId: '1', value: 'first' },
      { __rowId: '2', value: 'second' },
    ]
    getTableData
      .mockResolvedValueOnce({ rows: [], totalRows: 2 })
      .mockResolvedValueOnce({ rows: completeRows, totalRows: 2 })

    await expect(loadCleaningRows('table')).resolves.toEqual(completeRows)
    expect(getTableData).toHaveBeenNthCalledWith(1, 'table', 0, 0)
    expect(getTableData).toHaveBeenNthCalledWith(2, 'table', 0, 2)
  })

  it('rejects oversized tables before requesting all rows', async () => {
    getTableData.mockResolvedValue({
      rows: [],
      totalRows: 100_001,
    })

    await expect(loadCleaningRows('table')).rejects.toThrow(
      'limited to 100,000 rows',
    )
    expect(getTableData).toHaveBeenCalledTimes(1)
    expect(getTableData).toHaveBeenCalledWith('table', 0, 0)
  })
})
