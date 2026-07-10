import { describe, expect, it } from 'vitest'
import {
  getAllAncestors,
  getAllDescendants,
  getDirectDownstream,
  getDirectUpstream,
  getLeafNodes,
  getNodeDepth,
  getRootNodes,
  isAncestorOf,
  isDescendantOf,
} from './dependencyGraph'
import type { Edge, ProjectNode } from '@/types'

const edge = (fromNodeId: string, toNodeId: string): Edge => ({
  id: `edge_${fromNodeId}_${toNodeId}`,
  fromNodeId,
  toNodeId,
  transformType: 'filter',
})

const nodes = (...ids: string[]): Record<string, ProjectNode> =>
  Object.fromEntries(ids.map(id => [id, { id }])) as Record<string, ProjectNode>

describe('getAllDescendants', () => {
  it('finds all descendants without including self', () => {
    const descendants = getAllDescendants('A', { e1: edge('A', 'B'), e2: edge('B', 'C') })
    expect(descendants.has('B')).toBe(true)
    expect(descendants.has('C')).toBe(true)
    expect(descendants.has('A')).toBe(false)
  })

  it('handles branching', () => {
    const descendants = getAllDescendants('A', {
      e1: edge('A', 'B'),
      e2: edge('A', 'C'),
      e3: edge('B', 'D'),
    })
    expect(descendants.has('B')).toBe(true)
    expect(descendants.has('C')).toBe(true)
    expect(descendants.has('D')).toBe(true)
    expect(descendants.size).toBe(3)
  })

  it('returns an empty set for leaves', () => {
    expect(getAllDescendants('B', { e1: edge('A', 'B') }).size).toBe(0)
  })
})

describe('getAllAncestors', () => {
  it('finds all ancestors without including self', () => {
    const ancestors = getAllAncestors('C', { e1: edge('A', 'B'), e2: edge('B', 'C') })
    expect(ancestors.has('A')).toBe(true)
    expect(ancestors.has('B')).toBe(true)
    expect(ancestors.has('C')).toBe(false)
  })

  it('handles multiple parents', () => {
    const ancestors = getAllAncestors('C', { e1: edge('A', 'C'), e2: edge('B', 'C') })
    expect(ancestors.has('A')).toBe(true)
    expect(ancestors.has('B')).toBe(true)
    expect(ancestors.size).toBe(2)
  })

  it('returns an empty set for roots', () => {
    expect(getAllAncestors('A', { e1: edge('A', 'B') }).size).toBe(0)
  })
})

describe('direct dependencies', () => {
  it('returns only direct upstream and downstream nodes', () => {
    const edges = { e1: edge('A', 'B'), e2: edge('B', 'C') }
    const upstream = getDirectUpstream('B', edges)
    expect(upstream.has('A')).toBe(true)
    expect(upstream.size).toBe(1)
    const downstream = getDirectDownstream('B', edges)
    expect(downstream.has('C')).toBe(true)
    expect(downstream.size).toBe(1)
  })
})

describe('getNodeDepth', () => {
  it('returns zero for roots', () => {
    expect(getNodeDepth('A', { e1: edge('A', 'B') })).toBe(0)
  })

  it('returns depth through a chain', () => {
    const edges = { e1: edge('A', 'B'), e2: edge('B', 'C') }
    expect(getNodeDepth('A', edges)).toBe(0)
    expect(getNodeDepth('B', edges)).toBe(1)
    expect(getNodeDepth('C', edges)).toBe(2)
  })

  it('uses the maximum depth across multiple parents', () => {
    const edges = {
      e1: edge('A', 'B'),
      e2: edge('B', 'C'),
      e3: edge('D', 'C'),
    }
    expect(getNodeDepth('C', edges)).toBe(2)
  })
})

describe('ancestor and descendant predicates', () => {
  it('identifies ancestor relationships', () => {
    const edges = { e1: edge('A', 'B'), e2: edge('B', 'C') }
    expect(isAncestorOf('A', 'C', edges)).toBe(true)
    expect(isAncestorOf('A', 'B', edges)).toBe(true)
    expect(isAncestorOf('C', 'A', edges)).toBe(false)
  })

  it('identifies descendant relationships', () => {
    const edges = { e1: edge('A', 'B'), e2: edge('B', 'C') }
    expect(isDescendantOf('C', 'A', edges)).toBe(true)
    expect(isDescendantOf('B', 'A', edges)).toBe(true)
    expect(isDescendantOf('A', 'C', edges)).toBe(false)
  })
})

describe('root and leaf nodes', () => {
  it('identifies root nodes', () => {
    const graphNodes = nodes('A', 'B', 'C', 'D')
    const roots = getRootNodes(graphNodes, { e1: edge('A', 'B'), e2: edge('C', 'D') })
    expect(roots).toContain('A')
    expect(roots).toContain('C')
    expect(roots).not.toContain('B')
    expect(roots).not.toContain('D')
  })

  it('identifies leaf nodes', () => {
    const graphNodes = nodes('A', 'B', 'C', 'D')
    const leaves = getLeafNodes(graphNodes, {
      e1: edge('A', 'B'),
      e2: edge('B', 'C'),
      e3: edge('B', 'D'),
    })
    expect(leaves).toContain('C')
    expect(leaves).toContain('D')
    expect(leaves).not.toContain('A')
    expect(leaves).not.toContain('B')
  })
})
