import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTableData = vi.hoisted(() => vi.fn())

vi.mock('@/engine/materializationService', () => ({ getTableData }))

import { loadCleaningRows } from './cleaningRows'

beforeEach(() => {
  getTableData.mockReset()
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
        rows: [{ __rowId: '1', value: 'first' }],
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

  it('loads the complete table when the first page is partial', async () => {
    const completeRows = [
      { __rowId: '1', value: 'first' },
      { __rowId: '2', value: 'second' },
    ]
    getTableData
      .mockResolvedValueOnce({ rows: completeRows.slice(0, 1), totalRows: 2 })
      .mockResolvedValueOnce({ rows: completeRows, totalRows: 2 })

    await expect(loadCleaningRows('table')).resolves.toEqual(completeRows)
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
  })
})
