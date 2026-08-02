import { beforeEach, describe, expect, it } from 'vitest'
import { addFilter, addSource, cacheOf, clean, resetStore } from '@/engine/integrationTestUtils'
import { useDataStore } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'

beforeEach(() => {
  resetStore()
  useDataStore.setState({ tableData: {} })
})

describe('history slice', () => {
  it('restores patches on undo and redo while invalidating cached table data', () => {
    const tableId = addSource('Source')
    const derivedId = addFilter(tableId, 'Filtered')
    clean(tableId, derivedId)
    useProjectStore.setState({ history: { past: [], future: [] } })
    useProjectStore.getState().saveSnapshot('Before edit')
    useProjectStore.getState().setCellValue(tableId, 'row-1', 'col1', 'edited')
    useDataStore.getState().setTableData(tableId, [{ __rowId: 'row-1', col1: 'edited' }])
    const editedRevision = cacheOf(tableId)?.dataRevision ?? 0

    useProjectStore.getState().undo()

    expect(useProjectStore.getState().patches[tableId]?.cellPatches).toEqual({})
    expect(cacheOf(tableId)).toMatchObject({
      isDirty: true,
      isComputing: false,
    })
    const undoRevision = cacheOf(tableId)?.dataRevision ?? 0
    expect(undoRevision).toBeGreaterThan(editedRevision)
    expect(cacheOf(derivedId)?.isDirty).toBe(true)
    expect(useDataStore.getState().tableData).toEqual({})
    expect(useProjectStore.getState().canRedo()).toBe(true)

    useProjectStore.getState().redo()

    expect(useProjectStore.getState().patches[tableId].cellPatches.col1['row-1']).toBe('edited')
    expect(cacheOf(tableId)?.isDirty).toBe(true)
    expect(cacheOf(tableId)?.dataRevision ?? 0).toBeGreaterThan(undoRevision)
    expect(useDataStore.getState().tableData).toEqual({})
  })

  it('restores deleted source and dependent nodes as dirty tables', () => {
    const tableId = addSource('Source')
    const derivedId = addFilter(tableId, 'Filtered')
    useProjectStore.setState({ history: { past: [], future: [] } })

    useProjectStore.getState().deleteNode(tableId)
    expect(useProjectStore.getState().nodes[tableId]).toBeUndefined()
    expect(useProjectStore.getState().nodes[derivedId]).toBeUndefined()

    useProjectStore.getState().undo()

    expect(cacheOf(tableId)?.isDirty).toBe(true)
    expect(cacheOf(derivedId)?.isDirty).toBe(true)
    expect(Object.values(useProjectStore.getState().edges)).toContainEqual(
      expect.objectContaining({
        fromNodeId: tableId,
        toNodeId: derivedId,
      }),
    )
  })

  it('clears redo history after a new snapshot', () => {
    const tableId = addSource('Source')
    useProjectStore.setState({ history: { past: [], future: [] } })
    useProjectStore.getState().saveSnapshot('Before first edit')
    useProjectStore.getState().setCellValue(tableId, 'row-1', 'col1', 'first')
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().canRedo()).toBe(true)

    useProjectStore.getState().saveSnapshot('New edit')

    expect(useProjectStore.getState().canRedo()).toBe(false)
  })

  it('restores selection without invalidating data for a rename', () => {
    const firstId = addSource('First')
    const secondId = addSource('Second')
    clean(firstId, secondId)
    useDataStore.getState().setTableData(firstId, [{ __rowId: 'first', col1: 'A' }])
    useDataStore.getState().setTableData(secondId, [{ __rowId: 'second', col1: 'B' }])
    const secondUpdatedAt = useProjectStore.getState().nodes[secondId].updatedAt
    const secondRevision = cacheOf(secondId)?.dataRevision
    useProjectStore.setState({ history: { past: [], future: [] } })
    useProjectStore.getState().selectNode(firstId)
    useProjectStore.getState().saveSnapshot('Rename first')
    useProjectStore.getState().selectNode(secondId)
    useProjectStore.getState().updateNode(firstId, { name: 'Renamed first' })

    useProjectStore.getState().undo()

    expect(useProjectStore.getState().selectedNodeId).toBe(firstId)
    expect(useProjectStore.getState().nodes[firstId].name).toBe('First')
    expect(useProjectStore.getState().nodes[secondId].updatedAt).toBe(secondUpdatedAt)
    expect(cacheOf(secondId)?.dataRevision).toBe(secondRevision)
    expect(useDataStore.getState().tableData[firstId]?.rows).toHaveLength(1)
    expect(useDataStore.getState().tableData[secondId]?.rows).toHaveLength(1)
  })

  it('clears only affected rows and runtime schemas', () => {
    const firstId = addSource('First')
    const secondId = addSource('Second')
    clean(firstId, secondId)
    const firstSchema = useProjectStore.getState().getTableNode(firstId)!.schema!
    const secondSchema = useProjectStore.getState().getTableNode(secondId)!.schema!
    useTableRuntimeStore.getState().setMaterializedSchema(firstId, firstSchema)
    useTableRuntimeStore.getState().setMaterializedSchema(secondId, secondSchema)
    useDataStore.getState().setTableData(firstId, [{ __rowId: 'first', col1: 'A' }])
    useDataStore.getState().setTableData(secondId, [{ __rowId: 'second', col1: 'B' }])
    useProjectStore.setState({ history: { past: [], future: [] } })
    useProjectStore.getState().saveSnapshot('Edit first')
    useProjectStore.getState().setCellValue(firstId, 'first', 'col1', 'edited')

    useProjectStore.getState().undo()

    expect(useDataStore.getState().tableData[firstId]).toBeUndefined()
    expect(useDataStore.getState().tableData[secondId]?.rows).toHaveLength(1)
    expect(useTableRuntimeStore.getState().schemas[firstId]).toBeUndefined()
    expect(useTableRuntimeStore.getState().schemas[secondId]).toEqual(secondSchema)
  })

  it('commits or rolls back an async operation as one history step', () => {
    const originalId = addSource('Original')
    useProjectStore.getState().selectNode(originalId)
    useProjectStore.setState({ history: { past: [], future: [] } })
    const transactionId = useProjectStore
      .getState()
      .beginHistoryTransaction('Import one table')
    expect(transactionId).toBeTruthy()
    if (!transactionId) return

    const importedId = useProjectStore.getState().addSourceTable({
      name: 'Imported',
      fileRef: 'file-imported',
      fileName: 'imported.csv',
      fileType: 'csv',
      schema: { columns: [], rowCount: 0 },
      recordHistory: false,
    })
    expect(useProjectStore.getState().history.past).toHaveLength(0)
    expect(useProjectStore.getState().commitHistoryTransaction(transactionId)).toBe(true)
    expect(useProjectStore.getState().history.past).toHaveLength(1)

    useProjectStore.getState().undo()
    expect(useProjectStore.getState().nodes[importedId]).toBeUndefined()
    expect(useProjectStore.getState().selectedNodeId).toBe(originalId)
    useProjectStore.getState().redo()
    expect(useProjectStore.getState().nodes[importedId]?.name).toBe('Imported')

    const rollbackId = useProjectStore
      .getState()
      .beginHistoryTransaction('Rejected import')
    expect(rollbackId).toBeTruthy()
    if (!rollbackId) return
    const rejectedId = useProjectStore.getState().addSourceTable({
      name: 'Rejected',
      fileRef: 'file-rejected',
      fileName: 'rejected.csv',
      fileType: 'csv',
      schema: { columns: [], rowCount: 0 },
      recordHistory: false,
    })
    expect(useProjectStore.getState().rollbackHistoryTransaction(rollbackId)).toBe(true)
    expect(useProjectStore.getState().nodes[rejectedId]).toBeUndefined()
    expect(useProjectStore.getState().history.past).toHaveLength(1)
  })
})
