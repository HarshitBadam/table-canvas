import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import type { ProjectNode } from '@/types'
import type { ProjectSnapshot } from './dbCore'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
})

async function loadSyncBase() {
  return import('./projectSyncBase')
}

const node = (id: string, name: string): ProjectNode => ({
  id,
  kind: 'source_table',
  name,
  ui: { position: { x: 0, y: 0 } },
  plan: {
    fileRef: '',
    fileName: '',
    fileType: 'csv',
    inferredSchemaVersion: 1,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const snapshot = (name: string, nodeName = 'Table'): ProjectSnapshot => ({
  name,
  nodes: { node_1: node('node_1', nodeName) },
  edges: {},
  patches: {},
  reports: {},
})

describe('project sync base snapshots', () => {
  it('round-trips a stored base snapshot', async () => {
    const syncBase = await loadSyncBase()

    await syncBase.putProjectSyncBase('project-1', 7, snapshot('Quarterly'), 'account:a')

    const record = await syncBase.getProjectSyncBase('project-1', 'account:a')
    expect(record).toMatchObject({
      projectId: 'project-1',
      ownerId: 'account:a',
      revision: 7,
      snapshot: { name: 'Quarterly' },
    })
    expect(typeof record?.capturedAt).toBe('string')
  })

  it('returns null when no base was captured', async () => {
    const syncBase = await loadSyncBase()

    expect(await syncBase.getProjectSyncBase('missing', 'account:a')).toBeNull()
  })

  it('isolates the same project id across storage scopes', async () => {
    const syncBase = await loadSyncBase()

    await syncBase.putProjectSyncBase('project-1', 1, snapshot('Owner A'), 'account:a')
    await syncBase.putProjectSyncBase('project-1', 2, snapshot('Owner B'), 'account:b')

    expect((await syncBase.getProjectSyncBase('project-1', 'account:a'))?.snapshot.name)
      .toBe('Owner A')
    expect((await syncBase.getProjectSyncBase('project-1', 'account:b'))?.revision).toBe(2)
  })

  it('clears only the requested scope', async () => {
    const syncBase = await loadSyncBase()
    await syncBase.putProjectSyncBase('project-1', 1, snapshot('Owner A'), 'account:a')
    await syncBase.putProjectSyncBase('project-1', 1, snapshot('Owner B'), 'account:b')

    await syncBase.clearProjectSyncBase('project-1', 'account:a')

    expect(await syncBase.getProjectSyncBase('project-1', 'account:a')).toBeNull()
    expect(await syncBase.getProjectSyncBase('project-1', 'account:b')).not.toBeNull()
  })

  it('keeps the stored base when the caller mutates its snapshot afterwards', async () => {
    const syncBase = await loadSyncBase()
    const captured = snapshot('Quarterly', 'Original')

    await syncBase.putProjectSyncBase('project-1', 1, captured, 'account:a')
    captured.name = 'Mutated'
    captured.nodes.node_1.name = 'Mutated table'
    captured.edges.edge_1 = {
      id: 'edge_1',
      fromNodeId: 'node_1',
      toNodeId: 'node_1',
      transformType: 'filter',
    }

    const stored = await syncBase.getProjectSyncBase('project-1', 'account:a')
    expect(stored?.snapshot.name).toBe('Quarterly')
    expect(stored?.snapshot.nodes.node_1.name).toBe('Original')
    expect(stored?.snapshot.edges).toEqual({})
  })
})
