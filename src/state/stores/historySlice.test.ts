import { beforeEach, describe, expect, it } from 'vitest'
import { addFilter, addSource, cacheOf, clean, resetStore } from '@/engine/integrationTestUtils'
import { useDataStore } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'

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
})
