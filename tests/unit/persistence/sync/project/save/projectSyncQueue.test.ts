import { describe, expect, it } from 'vitest'
import {
  createMockReport,
  createMockSourceTableNode,
  getDB,
} from '@/persistence/storage/local-db/dbTestSupport'

describe('durable project sync queue', () => {
  it('keeps a newer generation when an older save is acknowledged', async () => {
    const db = await getDB()
    const scope = db.accountStorageScope('queue-user')
    db.setStorageScope(scope)
    await db.saveProject('project-1', 'First', {}, {}, {}, { revision: 4 })
    const first = await db.enqueueProjectSave(
      'project-1',
      { name: 'First', nodes: {}, edges: {}, patches: {}, reports: {} },
      4,
    )
    const second = await db.enqueueProjectSave(
      'project-1',
      { name: 'Second', nodes: {}, edges: {}, patches: {}, reports: {} },
      4,
    )

    await db.acknowledgeProjectSave(
      'project-1',
      first.generation,
      5,
      '2026-01-01T00:00:00.000Z',
    )

    expect(await db.getProjectSyncOperation('project-1')).toMatchObject({
      generation: second.generation,
      expectedRevision: 5,
      payload: { name: 'Second' },
    })
    expect((await db.loadProject('project-1'))?.revision).toBe(5)
  })

  it('isolates queued operations by account owner', async () => {
    const db = await getDB()
    const accountA = db.accountStorageScope('queue-a')
    const accountB = db.accountStorageScope('queue-b')
    await db.enqueueProjectSave(
      'same-project',
      { name: 'A', nodes: {}, edges: {}, patches: {}, reports: {} },
      0,
      accountA,
    )
    await db.enqueueProjectSave(
      'same-project',
      { name: 'B', nodes: {}, edges: {}, patches: {}, reports: {} },
      0,
      accountB,
    )

    expect((await db.listProjectSyncOperations(accountA))[0].payload?.name).toBe('A')
    expect((await db.listProjectSyncOperations(accountB))[0].payload?.name).toBe('B')
  })

  it('uses a fresh revision when a delete replaces a queued save', async () => {
    const db = await getDB()
    const scope = db.accountStorageScope('delete-after-save-user')
    db.setStorageScope(scope)
    await db.enqueueProjectSave(
      'project-1',
      { name: 'Pending save', nodes: {}, edges: {}, patches: {}, reports: {} },
      2,
    )

    const deletion = await db.enqueueProjectDelete('project-1', 5)

    expect(deletion).toMatchObject({
      operation: 'delete',
      expectedRevision: 5,
    })
  })

  it('replaces a queued payload, its revision and the local project together', async () => {
    const db = await getDB()
    const queue = await import('@/persistence/sync/project/save/projectSyncQueue')
    const scope = db.accountStorageScope('merge-retry-user')
    db.setStorageScope(scope)
    await db.saveProject('project-1', 'Before merge', {}, {}, {}, { revision: 4 })
    const queued = await db.enqueueProjectSave('project-1', {
      name: 'Before merge',
      nodes: {},
      edges: {},
      patches: {},
      reports: {},
    }, 4)

    const replaced = await queue.replaceQueuedProjectSave('project-1', {
      name: 'After merge',
      nodes: { node_1: createMockSourceTableNode('node_1', 'Merged') },
      edges: {},
      patches: {
        node_1: {
          cellPatches: { row_1: { col_1: 'merged' } },
          deletedRows: [],
          insertedRows: [],
          highlightedCells: [],
        },
      },
      reports: {},
    }, 9)

    expect(replaced).toMatchObject({
      generation: queued.generation + 1,
      expectedRevision: 9,
      payload: { name: 'After merge' },
    })
    expect(await db.getProjectSyncOperation('project-1')).toMatchObject({
      generation: queued.generation + 1,
      expectedRevision: 9,
      payload: { nodes: { node_1: { name: 'Merged' } } },
    })
    const project = await db.loadProject('project-1')
    expect(project).toMatchObject({ name: 'After merge', revision: 9 })
    expect(project?.patches.node_1.cellPatches).toEqual({ row_1: { col_1: 'merged' } })
  })

  it('refuses to replace anything but a queued save', async () => {
    const db = await getDB()
    const queue = await import('@/persistence/sync/project/save/projectSyncQueue')
    const scope = db.accountStorageScope('merge-retry-delete-user')
    db.setStorageScope(scope)
    await db.saveProject('project-1', 'Delete requested', {}, {}, {}, { revision: 4 })
    await db.enqueueProjectDelete('project-1', 4)
    const snapshot = {
      name: 'After merge',
      nodes: {},
      edges: {},
      patches: {},
      reports: {},
    }

    expect(await queue.replaceQueuedProjectSave('project-1', snapshot, 9)).toBeNull()
    expect(await db.getProjectSyncOperation('project-1')).toMatchObject({
      operation: 'delete',
      expectedRevision: 4,
    })
    expect(await db.loadProject('project-1')).toMatchObject({
      name: 'Delete requested',
      revision: 4,
    })
  })

  it('finalizes a delete atomically with its project and reports', async () => {
    const db = await getDB()
    const scope = db.accountStorageScope('delete-user')
    db.setStorageScope(scope)
    await db.saveProject('project-1', 'Delete me', {}, {}, {}, { revision: 2 })
    await db.saveReport({
      ...createMockReport('report-1', 'Delete me'),
      projectId: 'project-1',
    })
    const deletion = await db.enqueueProjectDelete('project-1', 2)

    await db.finalizeProjectDelete('project-1', deletion.generation)

    expect(await db.loadProject('project-1')).toBeNull()
    expect(await db.loadReportsForProject('project-1')).toEqual({})
    expect(await db.getProjectSyncOperation('project-1')).toBeNull()
  })

  it('rejects autosaves once a delete is queued for the project', async () => {
    const db = await getDB()
    const scope = db.accountStorageScope('delete-queued-user')
    db.setStorageScope(scope)
    await db.saveProject('project-1', 'Delete me', {}, {}, {}, { revision: 2 })
    const deletion = await db.enqueueProjectDelete('project-1', 2)

    await expect(db.saveProjectAndEnqueue(
      'project-1',
      'Ghost copy',
      {},
      {},
      {},
      {},
    )).rejects.toThrow(/deleted in another tab/i)
    expect(await db.getProjectSyncOperation('project-1')).toMatchObject({
      operation: 'delete',
      generation: deletion.generation,
    })
  })

  it('removes the durable snapshot while an offline delete remains queued', async () => {
    const db = await getDB()
    const scope = db.accountStorageScope('delete-snapshot-user')
    db.setStorageScope(scope)
    await db.saveProject('project-1', 'Delete me', {}, {}, {}, { revision: 2 })
    await db.saveReport({
      ...createMockReport('report-1', 'Delete me'),
      projectId: 'project-1',
    })
    await db.enqueueProjectDelete('project-1', 2)

    await db.deleteProjectSnapshot('project-1')

    expect(await db.loadProject('project-1')).toBeNull()
    expect(await db.loadReportsForProject('project-1')).toEqual({})
    expect(await db.getProjectSyncOperation('project-1')).toMatchObject({
      operation: 'delete',
    })
  })
})
