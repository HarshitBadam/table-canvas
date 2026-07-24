import { describe, expect, it } from 'vitest'
import { createMockReport, getDB } from './dbTestSupport'

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
})
