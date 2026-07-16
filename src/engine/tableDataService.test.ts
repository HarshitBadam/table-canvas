import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MaterializationResult } from './materializationService'
import type { TableSlice } from './types'
import { invalidateMaterializations } from './materializationCoordinator'
import { getTableData } from './tableDataService'

const mocks = vi.hoisted(() => ({
  projectId: 'project_a',
  ensureTableMaterialized: vi.fn(),
  getSlice: vi.fn(),
  getTableNode: vi.fn(),
}))

vi.mock('@/state/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      projectId: mocks.projectId,
      getTableNode: mocks.getTableNode,
    }),
  },
}))

vi.mock('./materializationService', () => ({
  ensureTableMaterialized: mocks.ensureTableMaterialized,
}))

vi.mock('./EngineAdapter', () => ({
  getEngine: () => ({ getSlice: mocks.getSlice }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(fulfill => {
    resolve = fulfill
  })
  return { promise, resolve }
}

describe('getTableData materialization scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.projectId = 'project_a'
    mocks.getTableNode.mockReturnValue({
      schema: {
        columns: [{ id: 'name', name: 'Name', type: 'string', nullable: true }],
      },
    })
  })

  it('does not read DuckDB when undo leaves materialization loading', async () => {
    mocks.ensureTableMaterialized.mockResolvedValue({
      status: 'loading',
      tableId: 'table_1',
    } satisfies MaterializationResult)

    const result = await getTableData('table_1')

    expect(mocks.getSlice).not.toHaveBeenCalled()
    expect(result).toEqual({
      rows: [],
      totalRows: 0,
      error: 'Table data changed while loading. Please try again.',
    })
  })

  it('does not read DuckDB after a project switch during materialization', async () => {
    const materialization = deferred<MaterializationResult>()
    mocks.ensureTableMaterialized.mockReturnValue(materialization.promise)
    const request = getTableData('table_1')

    mocks.projectId = 'project_b'
    materialization.resolve({ status: 'computed', tableId: 'table_1' })
    const result = await request

    expect(mocks.getSlice).not.toHaveBeenCalled()
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/data changed while loading/i)
  })

  it('discards rows when undo invalidates the generation during a DuckDB read', async () => {
    const slice = deferred<TableSlice>()
    mocks.ensureTableMaterialized.mockResolvedValue({
      status: 'cached',
      tableId: 'table_1',
    } satisfies MaterializationResult)
    mocks.getSlice.mockReturnValue(slice.promise)
    const request = getTableData('table_1')
    await vi.waitFor(() => expect(mocks.getSlice).toHaveBeenCalledOnce())

    invalidateMaterializations()
    slice.resolve({
      tableId: 'table_1',
      offset: 0,
      limit: 1000,
      rows: [{ __rowId: 'stale', Name: 'Stale row' }],
      totalRows: 1,
    })
    const result = await request

    expect(result.rows).toEqual([])
    expect(result.totalRows).toBe(0)
    expect(result.error).toMatch(/data changed while loading/i)
  })
})
