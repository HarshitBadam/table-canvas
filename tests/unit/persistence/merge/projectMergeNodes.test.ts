import { describe, expect, it } from 'vitest'
import type { ProjectNode } from '@/types'
import type { ProjectSnapshot } from '@/persistence/storage/local-db/dbCore'
import { mergeProjectSnapshots } from '@/persistence/merge/projectMerge'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-02T00:00:00.000Z'
const T2 = '2026-01-03T00:00:00.000Z'

interface NodeOptions {
  name?: string
  updatedAt?: string
  position?: { x: number; y: number }
}

const node = (id: string, options: NodeOptions = {}): ProjectNode => ({
  id,
  kind: 'source_table',
  name: options.name ?? id,
  ui: { position: options.position ?? { x: 0, y: 0 } },
  plan: {
    fileRef: '',
    fileName: `${id}.csv`,
    fileType: 'csv',
    inferredSchemaVersion: 1,
  },
  createdAt: T0,
  updatedAt: options.updatedAt ?? T0,
})

const withoutUpdatedAt = (source: ProjectNode): ProjectNode => {
  const copy: Partial<ProjectNode> = { ...source }
  delete copy.updatedAt
  return copy as ProjectNode
}

const snapshot = (nodes: ProjectNode[]): ProjectSnapshot => ({
  name: 'Project',
  nodes: Object.fromEntries(nodes.map(item => [item.id, item])),
  edges: {},
  patches: {},
  reports: {},
})

function merge(
  base: ProjectSnapshot | null,
  local: ProjectSnapshot,
  server: ProjectSnapshot,
): ProjectSnapshot {
  const outcome = mergeProjectSnapshots({ base, local, server })
  if (outcome.status !== 'merged') throw new Error(`Unexpected outcome: ${outcome.reason}`)
  return outcome.snapshot
}

describe('three-way node merge', () => {
  it('keeps disjoint edits from both sides', () => {
    const merged = merge(
      snapshot([node('a'), node('b')]),
      snapshot([node('a', { name: 'Local A', updatedAt: T1 }), node('b')]),
      snapshot([node('a'), node('b', { name: 'Server B', updatedAt: T1 })]),
    )

    expect(merged.nodes.a.name).toBe('Local A')
    expect(merged.nodes.b.name).toBe('Server B')
  })

  it('keeps the later edit when both sides changed the same node', () => {
    const merged = merge(
      snapshot([node('a')]),
      snapshot([node('a', { name: 'Local A', updatedAt: T2 })]),
      snapshot([node('a', { name: 'Server A', updatedAt: T1 })]),
    )

    expect(merged.nodes.a.name).toBe('Local A')
  })

  it('prefers the server when both sides share an updated timestamp', () => {
    const merged = merge(
      snapshot([node('a')]),
      snapshot([node('a', { name: 'Local A', updatedAt: T2 })]),
      snapshot([node('a', { name: 'Server A', updatedAt: T2 })]),
    )

    expect(merged.nodes.a.name).toBe('Server A')
  })

  it('prefers the server when the local timestamp is unparseable', () => {
    const merged = merge(
      snapshot([node('a')]),
      snapshot([node('a', { name: 'Local A', updatedAt: 'whenever' })]),
      snapshot([node('a', { name: 'Server A', updatedAt: T1 })]),
    )

    expect(merged.nodes.a.name).toBe('Server A')
  })

  it('prefers the server when either node has no timestamp', () => {
    const base = snapshot([node('a')])

    expect(merge(
      base,
      snapshot([withoutUpdatedAt(node('a', { name: 'Local A' }))]),
      snapshot([node('a', { name: 'Server A', updatedAt: T1 })]),
    ).nodes.a.name).toBe('Server A')

    expect(merge(
      base,
      snapshot([node('a', { name: 'Local A', updatedAt: T2 })]),
      snapshot([withoutUpdatedAt(node('a', { name: 'Server A' }))]),
    ).nodes.a.name).toBe('Server A')
  })

  it('resolves a ui-only conflict to the server while keeping the winning edits', () => {
    const merged = merge(
      snapshot([node('a', { updatedAt: T1 })]),
      snapshot([node('a', {
        name: 'Local A',
        updatedAt: T2,
        position: { x: 10, y: 10 },
      })]),
      snapshot([node('a', { updatedAt: T1, position: { x: 90, y: 90 } })]),
    )

    expect(merged.nodes.a.name).toBe('Local A')
    expect(merged.nodes.a.ui.position).toEqual({ x: 90, y: 90 })
  })

  it('takes the only moved position when just one side changed ui', () => {
    const merged = merge(
      snapshot([node('a', { updatedAt: T1 })]),
      snapshot([node('a', {
        name: 'Local A',
        updatedAt: T2,
        position: { x: 10, y: 10 },
      })]),
      snapshot([node('a', { name: 'Server A', updatedAt: T1 })]),
    )

    expect(merged.nodes.a.ui.position).toEqual({ x: 10, y: 10 })
  })

  it('keeps a server edit that raced a local delete', () => {
    const merged = merge(
      snapshot([node('a'), node('b')]),
      snapshot([node('b')]),
      snapshot([node('a', { name: 'Server A', updatedAt: T1 }), node('b')]),
    )

    expect(merged.nodes.a.name).toBe('Server A')
  })

  it('keeps a local edit that raced a server delete', () => {
    const merged = merge(
      snapshot([node('a'), node('b')]),
      snapshot([node('a', { name: 'Local A', updatedAt: T1 }), node('b')]),
      snapshot([node('b')]),
    )

    expect(merged.nodes.a.name).toBe('Local A')
  })

  it('drops a node deleted on one side and untouched on the other', () => {
    const merged = merge(
      snapshot([node('a'), node('b')]),
      snapshot([node('b')]),
      snapshot([node('a'), node('b')]),
    )

    expect(Object.keys(merged.nodes)).toEqual(['b'])
  })

  it('keeps nodes added on either side', () => {
    const merged = merge(
      snapshot([]),
      snapshot([node('local-only')]),
      snapshot([node('server-only')]),
    )

    expect(Object.keys(merged.nodes)).toEqual(['local-only', 'server-only'])
  })
})
