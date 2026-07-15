import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColumnSchema } from '@/types'
import { MiniTableView } from './MiniTableView'

const mocks = vi.hoisted(() => ({
  getTableData: vi.fn(),
  updateCacheInfo: vi.fn(),
}))

vi.mock('@/engine/materializationService', () => ({
  getTableData: mocks.getTableData,
}))

vi.mock('@/state/projectStore', () => ({
  useProjectStore: (selector: (state: { updateCacheInfo: typeof mocks.updateCacheInfo }) => unknown) =>
    selector({ updateCacheInfo: mocks.updateCacheInfo }),
}))

const columns: ColumnSchema[] = [
  { id: 'name', name: 'Name', type: 'string', nullable: true },
]

describe('MiniTableView engine preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles resolved errors, displays the root message, and retries cleanly', async () => {
    mocks.getTableData
      .mockResolvedValueOnce({
        rows: [],
        totalRows: 0,
        error: 'Data file not found. Please re-import the file.',
      })
      .mockResolvedValueOnce({ rows: [], totalRows: 0 })

    render(<MiniTableView tableId="table-1" columns={columns} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Data file not found. Please re-import the file.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(mocks.updateCacheInfo).toHaveBeenCalledWith('table-1', {
      error: undefined,
      isDirty: true,
      isComputing: false,
    })
    await waitFor(() => expect(mocks.getTableData).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('This table has no rows.')).toBeInTheDocument()
  })

  it('refetches when data revision or schema changes without a hash change', async () => {
    mocks.getTableData.mockResolvedValue({ rows: [], totalRows: 0 })
    const { rerender } = render(
      <MiniTableView
        tableId="table-1"
        columns={columns}
        versionHash="same-hash"
        dataRevision={1}
      />
    )
    await waitFor(() => expect(mocks.getTableData).toHaveBeenCalledTimes(1))

    rerender(
      <MiniTableView
        tableId="table-1"
        columns={columns}
        versionHash="same-hash"
        dataRevision={2}
      />
    )
    await waitFor(() => expect(mocks.getTableData).toHaveBeenCalledTimes(2))

    rerender(
      <MiniTableView
        tableId="table-1"
        columns={[{ ...columns[0], name: 'Display Name' }]}
        versionHash="same-hash"
        dataRevision={2}
      />
    )
    await waitFor(() => expect(mocks.getTableData).toHaveBeenCalledTimes(3))
  })
})
