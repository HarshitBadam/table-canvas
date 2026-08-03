import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addFilter, addSource, resetStore } from '@/engine/integrationTestUtils'
import {
  accountStorageScope,
  setStorageScope,
} from '@/persistence/storageScope'

const GUEST_SCOPE = 'guest:test-tab'
import { useProjectStore } from './projectStore'
import {
  getNodeCacheInfo,
  updateNodeCacheInfo,
  useTableRuntimeStore,
} from './tableRuntimeStore'
import { duplicateDerivedTable } from './duplicateDerivedTable'
import { setDocumentWriteGuard } from './transientProjectState'
import { waitForTableOperation } from './tableOperationCoordinator'

const mocks = vi.hoisted(() => ({
  ensureTableMaterialized: vi.fn(),
  readAllTableRows: vi.fn(),
  uploadFileWithSync: vi.fn(),
  deleteFileWithSync: vi.fn(),
  isNetworkOnline: vi.fn(),
}))

vi.mock('@/engine/materializationService', () => ({
  ensureTableMaterialized: mocks.ensureTableMaterialized,
}))
vi.mock('@/engine/readAllTableRows', () => ({
  readAllTableRows: mocks.readAllTableRows,
}))
vi.mock('@/persistence/syncService', () => ({
  uploadFileWithSync: mocks.uploadFileWithSync,
  deleteFileWithSync: mocks.deleteFileWithSync,
  isNetworkOnline: mocks.isNetworkOnline,
}))

const derivedSchema = {
  columns: [
    {
      id: 'calculated',
      name: 'Calculated',
      type: 'number' as const,
      nullable: true,
      isComputed: true,
      formula: '[Value] * 2',
    },
  ],
  rowCount: 1,
}

async function settleDuplicate(tableId: string): Promise<void> {
  await waitForTableOperation(tableId)
  await vi.waitFor(() => {
    const phase = getNodeCacheInfo(tableId)?.phase
    expect(phase === 'ready' || phase === 'error').toBe(true)
  })
}

beforeEach(() => {
  resetStore()
  vi.clearAllMocks()
  setStorageScope(GUEST_SCOPE)
  mocks.isNetworkOnline.mockReturnValue(true)
  mocks.ensureTableMaterialized.mockImplementation(async (tableId: string) => ({
    status: 'computed',
    tableId,
    rowCount: 1,
    schema: derivedSchema,
  }))
  mocks.readAllTableRows.mockResolvedValue([
    { __rowId: 'derived_row', calculated: 42 },
  ])
  mocks.uploadFileWithSync.mockResolvedValue({
    id: 'snapshot-file',
    name: 'Filtered copy.tablecanvas',
    contentType: 'application/vnd.tablecanvas.snapshot+json',
  })
  mocks.deleteFileWithSync.mockResolvedValue(undefined)
})

afterEach(() => {
  setDocumentWriteGuard(null)
  setStorageScope(GUEST_SCOPE)
})

describe('duplicateDerivedTable', () => {
  it('creates an independent editable source immediately, then finishes in the background', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    useTableRuntimeStore.getState().setMaterializedSchema(derivedId, derivedSchema)
    updateNodeCacheInfo(derivedId, {
      currentVersionHash: 'version-1',
      dataRevision: 1,
      isDirty: false,
    })
    const originalEdges = structuredClone(useProjectStore.getState().edges)

    const result = await duplicateDerivedTable(derivedId, 'guest')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(useProjectStore.getState().nodes[result.tableId]).toMatchObject({
      kind: 'source_table',
      name: 'Filtered copy',
      plan: { fileType: 'snapshot' },
    })

    await settleDuplicate(result.tableId)

    const state = useProjectStore.getState()
    const duplicate = state.nodes[result.tableId]
    expect(duplicate).toMatchObject({
      kind: 'source_table',
      name: 'Filtered copy',
      plan: {
        fileRef: 'snapshot-file',
        fileType: 'snapshot',
      },
      ui: {
        position: {
          x: state.nodes[derivedId].ui.position.x + 32,
          y: state.nodes[derivedId].ui.position.y + 32,
        },
      },
    })
    expect(duplicate).not.toHaveProperty('plan.transformDef')
    expect(mocks.readAllTableRows).toHaveBeenCalledWith(derivedId, { raw: true })
    expect(mocks.uploadFileWithSync).toHaveBeenCalledWith(
      expect.any(File),
      'test-project',
      undefined,
      { requireRemoteWhenOnline: true },
    )
    const uploadedFile = mocks.uploadFileWithSync.mock.calls[0][0] as File
    expect(uploadedFile.type).toBe('application/octet-stream')
    expect(uploadedFile.name).toMatch(/\.tablecanvas$/)
    expect(state.patches[result.tableId]).toMatchObject({
      cellPatches: {},
      insertedRows: [],
    })
    expect(state.edges).toEqual(originalEdges)
    expect(Object.values(state.edges).some(edge =>
      edge.fromNodeId === result.tableId || edge.toNodeId === result.tableId,
    )).toBe(false)
    expect(getNodeCacheInfo(result.tableId)?.phase).toBe('ready')
  })

  it('is restored by undo and redo without changing the original graph', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    useTableRuntimeStore.getState().setMaterializedSchema(derivedId, derivedSchema)
    updateNodeCacheInfo(derivedId, {
      currentVersionHash: 'version-1',
      isDirty: false,
    })

    const result = await duplicateDerivedTable(derivedId, 'guest')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await settleDuplicate(result.tableId)

    useProjectStore.getState().undo()
    expect(useProjectStore.getState().nodes[result.tableId]).toBeUndefined()
    expect(useProjectStore.getState().nodes[derivedId]?.kind).toBe('derived_table')

    useProjectStore.getState().redo()
    expect(useProjectStore.getState().nodes[result.tableId]).toMatchObject({
      kind: 'source_table',
      plan: { fileRef: 'snapshot-file' },
    })
    expect(Object.values(useProjectStore.getState().edges).some(edge =>
      edge.fromNodeId === result.tableId || edge.toNodeId === result.tableId,
    )).toBe(false)
  })

  it('can preserve the current selection for sidebar duplication', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    useTableRuntimeStore.getState().setMaterializedSchema(derivedId, derivedSchema)
    updateNodeCacheInfo(derivedId, {
      currentVersionHash: 'version-1',
      isDirty: false,
    })
    useProjectStore.getState().selectNode(sourceId)

    const result = await duplicateDerivedTable(
      derivedId,
      'guest',
      { selectDuplicate: false },
    )

    expect(result.ok).toBe(true)
    expect(useProjectStore.getState().selectedNodeId).toBe(sourceId)
    if (result.ok) await settleDuplicate(result.tableId)
  })

  it('keeps the pending copy and records an error when materialization fails', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    useTableRuntimeStore.getState().setMaterializedSchema(derivedId, derivedSchema)
    mocks.ensureTableMaterialized.mockResolvedValue({
      status: 'error',
      tableId: derivedId,
      error: 'Upstream source failed',
    })

    const result = await duplicateDerivedTable(derivedId, 'guest')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    await settleDuplicate(result.tableId)
    expect(getNodeCacheInfo(result.tableId)).toMatchObject({
      phase: 'error',
      error: 'Upstream source failed',
    })
    expect(mocks.uploadFileWithSync).not.toHaveBeenCalled()
  })

  it('enforces table limits before doing snapshot work', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    addSource('Two')
    addSource('Three')
    addSource('Four')

    const result = await duplicateDerivedTable(derivedId, 'guest')

    expect(result).toMatchObject({
      ok: false,
      code: 'LIMIT_EXCEEDED',
      violation: { limit: 5, tier: 'guest' },
    })
    expect(mocks.ensureTableMaterialized).not.toHaveBeenCalled()
    expect(mocks.uploadFileWithSync).not.toHaveBeenCalled()
  })

  it('refuses an unsynced snapshot for an offline cloud project', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    setStorageScope(accountStorageScope('google-user'))
    mocks.isNetworkOnline.mockReturnValue(false)

    const result = await duplicateDerivedTable(derivedId, 'google')

    expect(result).toMatchObject({ ok: false, code: 'OFFLINE' })
    expect(mocks.ensureTableMaterialized).not.toHaveBeenCalled()
    expect(mocks.uploadFileWithSync).not.toHaveBeenCalled()
  })

  it('records TABLE_CHANGED on the pending copy if source data changes while rows are read', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    useTableRuntimeStore.getState().setMaterializedSchema(derivedId, derivedSchema)
    updateNodeCacheInfo(derivedId, {
      currentVersionHash: 'version-1',
      dataRevision: 1,
      isDirty: false,
    })
    mocks.readAllTableRows.mockImplementation(async () => {
      updateNodeCacheInfo(derivedId, { dataRevision: 2 })
      return [{ __rowId: 'derived_row', calculated: 42 }]
    })

    const result = await duplicateDerivedTable(derivedId, 'guest')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await settleDuplicate(result.tableId)

    expect(getNodeCacheInfo(result.tableId)).toMatchObject({
      phase: 'error',
      error: expect.stringContaining('changed while it was being copied'),
    })
    expect(mocks.uploadFileWithSync).not.toHaveBeenCalled()
  })

  it('discards an uploaded snapshot if the write lease moves to another tab', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    useTableRuntimeStore.getState().setMaterializedSchema(derivedId, derivedSchema)
    updateNodeCacheInfo(derivedId, {
      currentVersionHash: 'version-1',
      isDirty: false,
    })
    mocks.uploadFileWithSync.mockImplementation(async () => {
      setDocumentWriteGuard(() => false)
      return {
        id: 'unused-snapshot',
        name: 'Filtered copy.tablecanvas',
        contentType: 'application/vnd.tablecanvas.snapshot+json',
      }
    })

    const result = await duplicateDerivedTable(derivedId, 'guest')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await settleDuplicate(result.tableId)

    expect(getNodeCacheInfo(result.tableId)).toMatchObject({
      phase: 'error',
      error: expect.stringContaining('another tab'),
    })
    expect(mocks.deleteFileWithSync).toHaveBeenCalledWith(
      'unused-snapshot',
      { strictRemote: true },
    )
    expect(Object.values(useProjectStore.getState().nodes)).toHaveLength(3)
  })

  it('discards an uploaded snapshot if the derived table changes during upload', async () => {
    const sourceId = addSource('Source')
    const derivedId = addFilter(sourceId, 'Filtered')
    useTableRuntimeStore.getState().setMaterializedSchema(derivedId, derivedSchema)
    updateNodeCacheInfo(derivedId, {
      currentVersionHash: 'version-1',
      dataRevision: 1,
      isDirty: false,
    })
    mocks.uploadFileWithSync.mockImplementation(async () => {
      updateNodeCacheInfo(derivedId, { dataRevision: 2 })
      return {
        id: 'stale-snapshot',
        name: 'Filtered copy.tablecanvas',
        contentType: 'application/vnd.tablecanvas.snapshot+json',
      }
    })

    const result = await duplicateDerivedTable(derivedId, 'guest')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await settleDuplicate(result.tableId)

    expect(getNodeCacheInfo(result.tableId)).toMatchObject({
      phase: 'error',
      error: expect.stringContaining('changed while it was being copied'),
    })
    expect(mocks.deleteFileWithSync).toHaveBeenCalledWith(
      'stale-snapshot',
      { strictRemote: true },
    )
  })
})
