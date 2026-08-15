import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColumnSchema } from '@/types'

const mocks = vi.hoisted(() => ({
  getTableData: vi.fn(),
}))

vi.mock('@/engine/materialization/tableDataService', () => ({
  getTableData: mocks.getTableData,
}))

import { useTransformPreview } from '@/canvas/modals/useTransformPreview'

const leftCols: ColumnSchema[] = [
  { id: 'l_id', name: 'ID', type: 'string', nullable: false },
  { id: 'l_name', name: 'Name', type: 'string', nullable: true },
]
const rightCols: ColumnSchema[] = [
  { id: 'r_id', name: 'ID', type: 'string', nullable: false },
  { id: 'r_label', name: 'Label', type: 'string', nullable: true },
]

function mockPreviewData() {
  mocks.getTableData
    .mockResolvedValueOnce({
      rows: [{ __rowId: '1', l_id: 'a' }, { __rowId: '2', l_id: 'b' }],
      totalRows: 2,
    })
    .mockResolvedValueOnce({
      rows: [{ __rowId: '1', r_id: 'a' }, { __rowId: '2', r_id: 'c' }],
      totalRows: 2,
    })
}

beforeEach(() => {
  mocks.getTableData.mockReset()
})

describe('useTransformPreview', () => {
  it('loads preview samples and auto-selects the best-matching key pair', async () => {
    mockPreviewData()

    const { result } = renderHook(() => useTransformPreview({
      isOpen: true,
      sourceNodeId: 'left',
      targetNodeId: 'right',
      leftCols,
      rightCols,
    }))

    expect(result.current.previewLoading).toBe(true)

    await waitFor(() => expect(result.current.previewLoading).toBe(false))

    expect(result.current.leftKey).toBe('l_id')
    expect(result.current.rightKey).toBe('r_id')
    expect(result.current.match.rate).toBe(50)
    expect(result.current.isExactMatch).toBe(true)
  })

  it('keeps a manually chosen key when the preview data refreshes', async () => {
    mockPreviewData()
    const { result, rerender } = renderHook(
      (props: { leftCols: ColumnSchema[]; rightCols: ColumnSchema[] }) => useTransformPreview({
        isOpen: true,
        sourceNodeId: 'left',
        targetNodeId: 'right',
        ...props,
      }),
      { initialProps: { leftCols, rightCols } },
    )

    await waitFor(() => expect(result.current.previewLoading).toBe(false))

    act(() => {
      result.current.setLeftKey('l_name')
      result.current.setRightKey('r_label')
    })

    rerender({ leftCols: [...leftCols], rightCols: [...rightCols] })

    expect(result.current.leftKey).toBe('l_name')
    expect(result.current.rightKey).toBe('r_label')
  })

  it('surfaces a retryable error when the preview fails to load', async () => {
    mocks.getTableData.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useTransformPreview({
      isOpen: true,
      sourceNodeId: 'left',
      targetNodeId: 'right',
      leftCols,
      rightCols,
    }))

    await waitFor(() => expect(result.current.previewLoading).toBe(false))
    expect(result.current.previewError).toBe('boom')

    mockPreviewData()
    act(() => result.current.retryPreview())

    await waitFor(() => expect(result.current.previewLoading).toBe(false))
    expect(result.current.previewError).toBeUndefined()
    expect(mocks.getTableData).toHaveBeenCalledTimes(4)
  })

  it('does not fetch preview data while the modal is closed', () => {
    renderHook(() => useTransformPreview({
      isOpen: false,
      sourceNodeId: 'left',
      targetNodeId: 'right',
      leftCols,
      rightCols,
    }))

    expect(mocks.getTableData).not.toHaveBeenCalled()
  })
})
