import { describe, expect, it } from 'vitest'
import type { Edge, ProjectNode } from '@/types'
import type { Report } from '@/report/types'
import type { ProjectSnapshot } from './dbCore'
import type { SerializedPatches } from './patchSerialization'
import { mergeProjectSnapshots } from './projectMerge'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-02T00:00:00.000Z'
const T2 = '2026-01-03T00:00:00.000Z'

const node = (id: string, updatedAt = T0): ProjectNode => ({
  id,
  kind: 'source_table',
  name: id,
  ui: { position: { x: 0, y: 0 } },
  plan: { fileRef: '', fileName: `${id}.csv`, fileType: 'csv', inferredSchemaVersion: 1 },
  createdAt: T0,
  updatedAt,
})

const edge = (id: string, from: string, to: string): Edge => ({
  id,
  fromNodeId: from,
  toNodeId: to,
  transformType: 'filter',
})

const report = (id: string, name: string, updatedAt: string): Report => ({
  id,
  name,
  createdAt: T0,
  updatedAt,
})

const patch = (overrides: Partial<SerializedPatches> = {}): SerializedPatches => ({
  cellPatches: {},
  deletedRows: [],
  insertedRows: [],
  highlightedCells: [],
  ...overrides,
})

interface SnapshotOptions {
  name?: string
  nodes?: ProjectNode[]
  edges?: Edge[]
  patches?: Record<string, SerializedPatches>
  reports?: Report[]
}

const snapshot = (options: SnapshotOptions = {}): ProjectSnapshot => ({
  name: options.name ?? 'Project',
  nodes: Object.fromEntries((options.nodes ?? []).map(item => [item.id, item])),
  edges: Object.fromEntries((options.edges ?? []).map(item => [item.id, item])),
  patches: options.patches ?? {},
  reports: Object.fromEntries((options.reports ?? []).map(item => [item.id, item])),
})

function merge(base: ProjectSnapshot | null, local: ProjectSnapshot, server: ProjectSnapshot) {
  const outcome = mergeProjectSnapshots({ base, local, server })
  if (outcome.status !== 'merged') throw new Error(`Unexpected outcome: ${outcome.reason}`)
  return outcome
}

const abc = [node('a'), node('b'), node('c')]

describe('three-way edge merge', () => {
  it('applies additions and removals from both sides', () => {
    const merged = merge(
      snapshot({ nodes: abc, edges: [edge('e_ab', 'a', 'b')] }),
      snapshot({ nodes: abc, edges: [edge('e_ab', 'a', 'b'), edge('e_bc', 'b', 'c')] }),
      snapshot({ nodes: abc, edges: [] }),
    )

    expect(Object.keys(merged.snapshot.edges)).toEqual(['e_bc'])
  })

  it('drops an edge whose endpoint was deleted', () => {
    const merged = merge(
      snapshot({ nodes: abc, edges: [edge('e_bc', 'b', 'c')] }),
      snapshot({ nodes: [node('a'), node('b')], edges: [edge('e_bc', 'b', 'c')] }),
      snapshot({ nodes: abc, edges: [edge('e_bc', 'b', 'c')] }),
    )

    expect(merged.snapshot.edges).toEqual({})
    expect(merged.droppedEdgeIds).toEqual(['e_bc'])
  })

  it('drops the later edge when both sides close a cycle', () => {
    const merged = merge(
      snapshot({ nodes: abc }),
      snapshot({ nodes: abc, edges: [edge('e_ab', 'a', 'b')] }),
      snapshot({ nodes: abc, edges: [edge('e_ba', 'b', 'a')] }),
    )

    expect(Object.keys(merged.snapshot.edges)).toEqual(['e_ab'])
    expect(merged.droppedEdgeIds).toEqual(['e_ba'])
  })
})

describe('three-way patch merge', () => {
  const patched = (cells: Record<string, Record<string, unknown>>) => ({
    a: patch({ cellPatches: cells }),
  })

  it('keeps cell edits from both sides', () => {
    const merged = merge(
      snapshot({ nodes: [node('a')], patches: patched({ r1: { c1: 'base' } }) }),
      snapshot({ nodes: [node('a')], patches: patched({ r1: { c1: 'local' } }) }),
      snapshot({
        nodes: [node('a')],
        patches: patched({ r1: { c1: 'base' }, r2: { c1: 'server' } }),
      }),
    )

    expect(merged.snapshot.patches.a.cellPatches).toEqual({
      r1: { c1: 'local' },
      r2: { c1: 'server' },
    })
  })

  it('resolves a conflicting cell by the owning node timestamp', () => {
    const base = snapshot({
      nodes: [node('a')],
      patches: patched({ r1: { c1: 'base' } }),
    })
    const local = (updatedAt: string) => snapshot({
      nodes: [node('a', updatedAt)],
      patches: patched({ r1: { c1: 'local' } }),
    })
    const server = snapshot({
      nodes: [node('a', T1)],
      patches: patched({ r1: { c1: 'server' } }),
    })

    expect(merge(base, local(T2), server).snapshot.patches.a.cellPatches.r1.c1).toBe('local')
    expect(merge(base, local(T1), server).snapshot.patches.a.cellPatches.r1.c1).toBe('server')
  })

  it('keeps a cell edit that raced a cell deletion', () => {
    const merged = merge(
      snapshot({ nodes: [node('a')], patches: patched({ r1: { c1: 'base', c2: 'base' } }) }),
      snapshot({ nodes: [node('a', T2)], patches: patched({ r1: { c1: 'local' } }) }),
      snapshot({ nodes: [node('a', T1)], patches: patched({ r1: { c1: 'base', c2: 'server' } }) }),
    )

    expect(merged.snapshot.patches.a.cellPatches.r1).toEqual({ c1: 'local', c2: 'server' })
  })

  it('unions deleted rows and honours removals', () => {
    const merged = merge(
      snapshot({ nodes: [node('a')], patches: { a: patch({ deletedRows: ['r1', 'r4'] }) } }),
      snapshot({
        nodes: [node('a')],
        patches: { a: patch({ deletedRows: ['r4', 'r2', 'r1'] }) },
      }),
      snapshot({ nodes: [node('a')], patches: { a: patch({ deletedRows: ['r3', 'r1'] }) } }),
    )

    expect(merged.snapshot.patches.a.deletedRows).toEqual(['r1', 'r2', 'r3'])
  })

  it('drops patches for nodes that no longer exist', () => {
    const merged = merge(
      snapshot({ nodes: [node('a'), node('b')], patches: { b: patch({ deletedRows: ['r1'] }) } }),
      snapshot({ nodes: [node('a')], patches: { b: patch({ deletedRows: ['r1'] }) } }),
      snapshot({ nodes: [node('a'), node('b')], patches: { b: patch({ deletedRows: ['r1'] }) } }),
    )

    expect(merged.snapshot.patches).toEqual({})
  })
})

describe('three-way report merge', () => {
  it('keeps the newer report and recovers the losing edit', () => {
    const merged = merge(
      snapshot({ reports: [report('r1', 'Draft', T0)] }),
      snapshot({ reports: [report('r1', 'Local draft', T2)] }),
      snapshot({ reports: [report('r1', 'Server draft', T1)] }),
    )

    expect(merged.snapshot.reports.r1.name).toBe('Local draft')
    expect(merged.snapshot.reports.r1__recovered).toMatchObject({
      id: 'r1__recovered',
      name: 'Server draft (recovered)',
      updatedAt: T1,
    })
    expect(merged.recoveredReportIds).toEqual(['r1__recovered'])
  })

  it('keeps a report edit that raced a deletion without recovering a copy', () => {
    const merged = merge(
      snapshot({ reports: [report('r1', 'Draft', T0)] }),
      snapshot({ reports: [] }),
      snapshot({ reports: [report('r1', 'Server draft', T1)] }),
    )

    expect(merged.snapshot.reports.r1.name).toBe('Server draft')
    expect(merged.recoveredReportIds).toEqual([])
  })
})

describe('project snapshot merge outcomes', () => {
  it('takes the renamed side and prefers the server when both renamed', () => {
    expect(merge(
      snapshot({ name: 'Base' }),
      snapshot({ name: 'Local' }),
      snapshot({ name: 'Base' }),
    ).snapshot.name).toBe('Local')

    expect(merge(
      snapshot({ name: 'Base' }),
      snapshot({ name: 'Local' }),
      snapshot({ name: 'Server' }),
    ).snapshot.name).toBe('Server')
  })

  it('reports a missing base as unmergeable', () => {
    expect(mergeProjectSnapshots({
      base: null,
      local: snapshot(),
      server: snapshot(),
    })).toEqual({ status: 'unmergeable', reason: 'missing_base' })
  })

  it('reports a merge that exceeds the server node limit as unmergeable', () => {
    const many = Array.from({ length: 5_001 }, (_, index) => node(`node_${index}`))

    expect(mergeProjectSnapshots({
      base: snapshot(),
      local: snapshot({ nodes: many }),
      server: snapshot(),
    })).toEqual({ status: 'unmergeable', reason: 'limits_exceeded' })
  })

  it('produces byte-identical output for the same input', () => {
    const base = snapshot({
      nodes: abc,
      edges: [edge('e_ab', 'a', 'b')],
      patches: { a: patch({ cellPatches: { r1: { c1: 'base' } }, deletedRows: ['r9'] }) },
      reports: [report('r1', 'Draft', T0)],
    })
    const local = snapshot({
      name: 'Local',
      nodes: [node('a', T2), node('b'), node('c')],
      edges: [edge('e_ab', 'a', 'b'), edge('e_bc', 'b', 'c')],
      patches: {
        a: patch({
          cellPatches: { r1: { c1: 'local' }, r0: { c2: 'local' } },
          deletedRows: ['r9', 'r8'],
          insertedRows: [{ rowId: 'r7', values: { c1: 1 }, insertedAt: 2 }],
        }),
      },
      reports: [report('r1', 'Local draft', T2)],
    })
    const server = snapshot({
      nodes: [node('a', T1), node('c'), node('b')],
      edges: [edge('e_ca', 'c', 'a'), edge('e_ab', 'a', 'b')],
      patches: {
        a: patch({
          cellPatches: { r1: { c1: 'server' } },
          insertedRows: [{ rowId: 'r6', values: { c1: 2 }, insertedAt: 1 }],
        }),
      },
      reports: [report('r1', 'Server draft', T1)],
    })

    const first = mergeProjectSnapshots({ base, local, server })
    const second = mergeProjectSnapshots({ base, local, server })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first).toEqual(second)
  })
})
