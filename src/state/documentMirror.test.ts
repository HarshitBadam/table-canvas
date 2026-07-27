import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceTableNode } from '@/types'
import {
  FakeBroadcastChannel,
  resetChannelBus,
  settleTabs,
} from '@/test/fakeTabEnvironment'

const KEY = 'guest::project-1'

interface Tab {
  mirror: typeof import('./documentMirror')
  projectStore: typeof import('./projectStore')
  runtimeStore: typeof import('./tableRuntimeStore')
}

/** Each tab is its own module registry, so the stores are per tab like real tabs. */
async function openTab(): Promise<Tab> {
  vi.resetModules()
  const [mirror, projectStore, runtimeStore] = await Promise.all([
    import('./documentMirror'),
    import('./projectStore'),
    import('./tableRuntimeStore'),
  ])
  return { mirror, projectStore, runtimeStore }
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

function seedDocument(tab: Tab, updatedAt: string): void {
  tab.projectStore.useProjectStore.setState({
    projectId: 'project-1',
    projectName: 'Quarterly numbers',
    nodes: { 'table-1': tableNode('table-1', updatedAt) },
    edges: {},
    patches: {},
  })
}

beforeEach(() => {
  resetChannelBus()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('documentMirror', () => {
  it('publishes the owner document to other tabs on the same document', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(KEY)
    seedDocument(owner, '2026-01-02T00:00:00.000Z')

    const follower = await openTab()
    const stopFollower = follower.mirror.startDocumentMirror(KEY)
    seedDocument(follower, '2026-01-01T00:00:00.000Z')

    owner.mirror.publishDocumentSnapshot()
    await settleTabs()

    const mirrored = follower.projectStore.useProjectStore.getState()
    expect(mirrored.projectName).toBe('Quarterly numbers')
    expect(mirrored.nodes['table-1']?.updatedAt).toBe('2026-01-02T00:00:00.000Z')
    // Another tab's edits must not be undoable here.
    expect(mirrored.history).toEqual({ past: [], future: [] })
    // The mirrored table has to be recomputed against the new data.
    expect(
      follower.runtimeStore.useTableRuntimeStore.getState().cacheInfo['table-1']?.isDirty,
    ).toBe(true)

    stopOwner()
    stopFollower()
  })

  it('ignores its own publishes so a save cannot bounce back', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(KEY)
    seedDocument(owner, '2026-01-02T00:00:00.000Z')
    owner.projectStore.useProjectStore.setState({
      history: { past: [{ label: 'Edit cell' }], future: [] } as never,
    })

    owner.mirror.publishDocumentSnapshot()
    await settleTabs()

    // Applying an own snapshot would have cleared the undo stack.
    expect(owner.projectStore.useProjectStore.getState().history.past).toHaveLength(1)
    stopOwner()
  })

  it('does not reach tabs on a different document', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(KEY)
    seedDocument(owner, '2026-01-02T00:00:00.000Z')

    const otherProject = await openTab()
    const stopOther = otherProject.mirror.startDocumentMirror('guest::project-2')
    seedDocument(otherProject, '2026-01-01T00:00:00.000Z')

    owner.mirror.publishDocumentSnapshot()
    await settleTabs()

    expect(
      otherProject.projectStore.useProjectStore.getState().nodes['table-1']?.updatedAt,
    ).toBe('2026-01-01T00:00:00.000Z')

    stopOwner()
    stopOther()
  })

  it('stops applying snapshots once the mirror is torn down', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(KEY)
    seedDocument(owner, '2026-01-02T00:00:00.000Z')

    const follower = await openTab()
    const stopFollower = follower.mirror.startDocumentMirror(KEY)
    seedDocument(follower, '2026-01-01T00:00:00.000Z')
    stopFollower()

    owner.mirror.publishDocumentSnapshot()
    await settleTabs()

    expect(
      follower.projectStore.useProjectStore.getState().nodes['table-1']?.updatedAt,
    ).toBe('2026-01-01T00:00:00.000Z')
    stopOwner()
  })

  it('revives patch sets and drops nodes the owner deleted', async () => {
    const owner = await openTab()
    const stopOwner = owner.mirror.startDocumentMirror(KEY)
    owner.projectStore.useProjectStore.setState({
      projectId: 'project-1',
      projectName: 'Quarterly numbers',
      nodes: { 'table-1': tableNode('table-1', '2026-01-02T00:00:00.000Z') },
      edges: {},
      patches: {
        'table-1': {
          cellPatches: { 'row-1': { 'column-1': 'edited' } },
          insertedRows: [],
          deletedRows: new Set(['row-9']),
          highlightedCells: new Set(['row-1:column-1']),
        },
      },
    })

    const follower = await openTab()
    const stopFollower = follower.mirror.startDocumentMirror(KEY)
    seedDocument(follower, '2026-01-01T00:00:00.000Z')
    follower.projectStore.useProjectStore.setState({
      nodes: {
        'table-1': tableNode('table-1', '2026-01-01T00:00:00.000Z'),
        'table-2': tableNode('table-2', '2026-01-01T00:00:00.000Z'),
      },
    })
    follower.runtimeStore.useTableRuntimeStore.getState().updateCacheInfo('table-2', {
      lastRowCount: 5,
    })

    owner.mirror.publishDocumentSnapshot()
    await settleTabs()

    const mirrored = follower.projectStore.useProjectStore.getState()
    expect(mirrored.nodes['table-2']).toBeUndefined()
    expect(mirrored.patches['table-1']?.deletedRows).toBeInstanceOf(Set)
    expect(mirrored.patches['table-1']?.deletedRows.has('row-9')).toBe(true)
    expect(mirrored.patches['table-1']?.highlightedCells?.has('row-1:column-1')).toBe(true)
    expect(
      follower.runtimeStore.useTableRuntimeStore.getState().cacheInfo['table-2'],
    ).toBeUndefined()

    stopOwner()
    stopFollower()
  })
})
