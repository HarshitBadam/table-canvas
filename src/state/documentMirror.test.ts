import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import type { SourceTableNode } from '@/types'
import {
  FakeBroadcastChannel,
  resetChannelBus,
  settleTabs,
} from '@/test/fakeTabEnvironment'
import type { DocumentIdentity } from './documentIdentity'

const IDENTITY: DocumentIdentity = {
  scope: 'guest',
  projectId: 'project-1',
  key: 'guest\u001fproject-1',
}

interface Tab {
  db: typeof import('@/persistence/db')
  mirror: typeof import('./documentMirror')
  projectStore: typeof import('./projectStore')
  runtimeStore: typeof import('./tableRuntimeStore')
}

/** Each tab has its own stores and coordination module, like separate pages. */
async function openTab(): Promise<Tab> {
  vi.resetModules()
  const [db, mirror, projectStore, runtimeStore] = await Promise.all([
    import('@/persistence/db'),
    import('./documentMirror'),
    import('./projectStore'),
    import('./tableRuntimeStore'),
  ])
  return { db, mirror, projectStore, runtimeStore }
}

function tableNode(id: string, updatedAt: string): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name: `Table ${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    ui: { position: { x: 0, y: 0 } },
    source: { fileRef: `file-${id}`, fileName: `${id}.csv`, fileType: 'csv' },
    schema: { columns: [], rowCount: 0 },
  } as unknown as SourceTableNode
}

function seedMemory(tab: Tab, updatedAt: string): void {
  tab.projectStore.useProjectStore.setState({
    projectId: IDENTITY.projectId,
    projectName: 'Quarterly numbers',
    nodes: { 'table-1': tableNode('table-1', updatedAt) },
    edges: {},
    patches: {},
  })
}

async function persistDocument(
  tab: Tab,
  nodes: Record<string, SourceTableNode>,
): Promise<void> {
  await tab.db.saveProject(
    IDENTITY.projectId,
    'Quarterly numbers',
    nodes,
    {},
    {},
    undefined,
    IDENTITY.scope,
  )
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetChannelBus()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('documentMirror durable invalidation', () => {
  it('reloads the committed IndexedDB snapshot instead of a message payload', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(IDENTITY)
    const follower = await openTab()
    const stopFollower = follower.mirror.startDocumentMirror(IDENTITY)
    seedMemory(follower, '2026-01-01T00:00:00.000Z')
    follower.projectStore.useProjectStore.setState({ selectedNodeId: 'table-1' })

    await persistDocument(owner, {
      'table-1': tableNode('table-1', '2026-01-02T00:00:00.000Z'),
    })
    owner.mirror.publishDocumentInvalidation()
    await settleTabs()

    const mirrored = follower.projectStore.useProjectStore.getState()
    expect(mirrored.nodes['table-1']?.updatedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(mirrored.selectedNodeId).toBe('table-1')
    expect(mirrored.history).toEqual({ past: [], future: [] })
    expect(
      follower.runtimeStore.useTableRuntimeStore.getState().cacheInfo['table-1']?.isDirty,
    ).toBe(true)

    stopOwner()
    stopFollower()
  })

  it('ignores its own invalidation so a save cannot clear editor history', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(IDENTITY)
    seedMemory(owner, '2026-01-02T00:00:00.000Z')
    owner.projectStore.useProjectStore.setState({
      history: { past: [{ label: 'Edit cell' }], future: [] } as never,
    })
    await persistDocument(owner, {
      'table-1': tableNode('table-1', '2026-01-02T00:00:00.000Z'),
    })

    owner.mirror.publishDocumentInvalidation()
    await settleTabs()

    expect(owner.projectStore.useProjectStore.getState().history.past).toHaveLength(1)
    stopOwner()
  })

  it('never exposes an incomplete pending import to a reader', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(IDENTITY)
    const follower = await openTab()
    const stopFollower = follower.mirror.startDocumentMirror(IDENTITY)
    seedMemory(follower, '2026-01-01T00:00:00.000Z')

    const pending = {
      ...tableNode('table-pending', '2026-01-02T00:00:00.000Z'),
      plan: {
        fileRef: 'pending:abc',
        fileName: 'pending.csv',
        fileType: 'csv',
        inferredSchemaVersion: 1,
      },
    } as SourceTableNode
    await persistDocument(owner, {
      'table-ready': tableNode('table-ready', '2026-01-02T00:00:00.000Z'),
      'table-pending': pending,
    })

    owner.mirror.publishDocumentInvalidation()
    await settleTabs()

    const mirrored = follower.projectStore.useProjectStore.getState()
    expect(mirrored.nodes['table-ready']).toBeDefined()
    expect(mirrored.nodes['table-pending']).toBeUndefined()
    stopOwner()
    stopFollower()
  })

  it('does not reach a different document or a stopped reader', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(IDENTITY)
    const other = await openTab()
    const stopOther = other.mirror.startDocumentMirror({
      scope: 'guest',
      projectId: 'project-2',
      key: 'guest\u001fproject-2',
    })
    seedMemory(other, '2026-01-01T00:00:00.000Z')
    stopOther()
    await persistDocument(owner, {
      'table-1': tableNode('table-1', '2026-01-02T00:00:00.000Z'),
    })

    owner.mirror.publishDocumentInvalidation()
    await settleTabs()

    expect(
      other.projectStore.useProjectStore.getState().nodes['table-1']?.updatedAt,
    ).toBe('2026-01-01T00:00:00.000Z')
    stopOwner()
  })
})
