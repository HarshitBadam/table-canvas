import { describe, expect, it } from 'vitest'
import type { Edge, ProjectNode } from '@/types'
import {
  getDependentNodeIds,
  getTransformSourceTableIds,
  hasEdgeCycle,
  removeCyclicEdges,
} from './workflowGraph'

const now = new Date().toISOString()
const source = (id: string): ProjectNode => ({
  id,
  kind: 'source_table',
  name: id,
  ui: { position: { x: 0, y: 0 } },
  plan: {
    fileRef: '',
    fileName: '',
    fileType: 'csv',
    inferredSchemaVersion: 1,
  },
  createdAt: now,
  updatedAt: now,
})

describe('workflow graph integrity', () => {
  it('returns every source for multi-input transforms', () => {
    expect(getTransformSourceTableIds({
      type: 'join',
      leftTableId: 'left',
      rightTableId: 'right',
      leftKey: 'id',
      rightKey: 'id',
      joinType: 'inner',
    })).toEqual(['left', 'right'])
    expect(getTransformSourceTableIds({
      type: 'union',
      sourceTableIds: ['a', 'b', 'a'],
    })).toEqual(['a', 'b'])
  })

  it('finds transitive dependents even when an edge is missing', () => {
    const nodes: Record<string, ProjectNode> = {
      source: source('source'),
      derived: {
        id: 'derived',
        kind: 'derived_table',
        name: 'derived',
        ui: { position: { x: 1, y: 0 } },
        plan: {
          transformDef: {
            type: 'filter',
            sourceTableId: 'source',
            conditions: [],
            logic: 'and',
          },
          upstreamNodeIds: ['source'],
        },
        createdAt: now,
        updatedAt: now,
      },
      chart: {
        id: 'chart',
        kind: 'chart',
        name: 'chart',
        ui: { position: { x: 2, y: 0 } },
        plan: {
          chartType: 'bar',
          sourceTableId: 'derived',
          config: {},
        },
        createdAt: now,
        updatedAt: now,
      },
    }
    const edges: Record<string, Edge> = {}

    expect([...getDependentNodeIds(nodes, edges, 'source')].sort()).toEqual([
      'chart',
      'derived',
    ])
  })
})

const edge = (id: string, from: string, to: string): Edge => ({
  id,
  fromNodeId: from,
  toNodeId: to,
  transformType: 'filter',
})

const edgeMap = (...list: Edge[]): Record<string, Edge> => Object.fromEntries(
  list.map(item => [item.id, item]),
)

describe('edge cycle detection', () => {
  it('accepts a chain without a cycle', () => {
    expect(hasEdgeCycle(edgeMap(
      edge('e1', 'a', 'b'),
      edge('e2', 'b', 'c'),
      edge('e3', 'a', 'c'),
    ))).toBe(false)
  })

  it('detects a three node loop', () => {
    expect(hasEdgeCycle(edgeMap(
      edge('e1', 'a', 'b'),
      edge('e2', 'b', 'c'),
      edge('e3', 'c', 'a'),
    ))).toBe(true)
  })

  it('detects a self loop', () => {
    expect(hasEdgeCycle(edgeMap(edge('e1', 'a', 'a')))).toBe(true)
  })

  it('drops the later edge and keeps the earlier one', () => {
    const edges = edgeMap(edge('e2', 'b', 'a'), edge('e1', 'a', 'b'))

    const result = removeCyclicEdges(edges, ['e1', 'e2'])

    expect(Object.keys(result.edges)).toEqual(['e1'])
    expect(result.removedEdgeIds).toEqual(['e2'])
    expect(hasEdgeCycle(result.edges)).toBe(false)
  })

  it('keeps every edge of an acyclic graph in the supplied order', () => {
    const edges = edgeMap(edge('e1', 'a', 'b'), edge('e2', 'b', 'c'))

    const result = removeCyclicEdges(edges, ['e2', 'e1'])

    expect(Object.keys(result.edges)).toEqual(['e2', 'e1'])
    expect(result.removedEdgeIds).toEqual([])
  })
})
