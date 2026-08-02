import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStore } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'
import { getNodeCacheInfo, useTableRuntimeStore } from '@/state/tableRuntimeStore'
import { stageImportedTable } from './stageImportedTable'

const mocks = vi.hoisted(() => ({
  loadTableIntoEngine: vi.fn(),
}))

vi.mock('@/engine/loadTableIntoEngine', () => ({
  loadTableIntoEngine: mocks.loadTableIntoEngine,
}))

const schema = {
  columns: [
    { id: 'col_id', name: 'id', type: 'number' as const, nullable: false },
  ],
  rowCount: 2,
}

beforeEach(() => {
  resetStore()
  useTableRuntimeStore.getState().resetRuntime()
  vi.clearAllMocks()
  mocks.loadTableIntoEngine.mockResolvedValue(true)
})

describe('stageImportedTable', () => {
  it('updates a reserved pending node and marks it ready after engine load', async () => {
    const tableId = useProjectStore.getState().addSourceTable({
      name: 'pending',
      fileRef: 'pending:tmp',
      fileName: 'data.csv',
      fileType: 'csv',
      schema: { columns: [], rowCount: 0 },
    })
    useTableRuntimeStore.getState().updateCacheInfo(tableId, {
      phase: 'reading',
      operationGeneration: 3,
      isDirty: true,
    })

    await stageImportedTable({
      name: 'pending',
      fileRef: 'file-1',
      fileName: 'data.csv',
      fileType: 'csv',
      schema,
      rows: [
        { __rowId: 'row_0', col_id: 1 },
        { __rowId: 'row_1', col_id: 2 },
      ],
      engineError: 'engine failed',
      tableId,
      operationGeneration: 3,
    })

    expect(useProjectStore.getState().nodes[tableId]).toMatchObject({
      plan: { fileRef: 'file-1', fileType: 'csv' },
      schema,
    })
    expect(mocks.loadTableIntoEngine).toHaveBeenCalledWith(
      tableId,
      schema,
      expect.any(Array),
    )
    expect(getNodeCacheInfo(tableId)).toMatchObject({
      phase: 'ready',
      isComputing: false,
      isDirty: false,
    })
  })

  it('fails the reserved operation when the engine load returns false', async () => {
    mocks.loadTableIntoEngine.mockResolvedValue(false)
    const tableId = useProjectStore.getState().addSourceTable({
      name: 'pending',
      fileRef: 'pending:tmp',
      fileName: 'data.csv',
      fileType: 'csv',
      schema: { columns: [], rowCount: 0 },
      recordHistory: false,
    })
    useTableRuntimeStore.getState().updateCacheInfo(tableId, {
      phase: 'uploading',
      operationGeneration: 1,
      isDirty: true,
    })

    await expect(stageImportedTable({
      name: 'pending',
      fileRef: 'file-1',
      fileName: 'data.csv',
      fileType: 'csv',
      schema,
      rows: [{ __rowId: 'row_0', col_id: 1 }],
      engineError: 'engine failed',
      tableId,
      operationGeneration: 1,
    })).rejects.toThrow('engine failed')

    expect(getNodeCacheInfo(tableId)).toMatchObject({
      phase: 'error',
      error: 'engine failed',
    })
  })
})
