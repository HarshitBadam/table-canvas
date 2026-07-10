import { describe, expect, it } from 'vitest'
import {
  buildDependencyGraph,
  detectCycles,
  getComputationOrder,
  getTopologicalOrder,
  wouldCreateCycle,
} from './dependencyGraph'
import type { Edge, ProjectNode } from '@/types'

const edge = (fromNodeId: string, toNodeId: string, index = 0): Edge => ({
  id: `edge_${fromNodeId}_${toNodeId}_${index}`,
  fromNodeId,
  toNodeId,
  transformType: 'filter',
})

const nodes = (...ids: string[]): Record<string, ProjectNode> =>
  Object.fromEntries(ids.map(id => [id, { id }])) as Record<string, ProjectNode>

describe('buildDependencyGraph', () => {
  it('builds an empty graph for empty edges', () => {
    const graph = buildDependencyGraph({})
    expect(graph.upstream.size).toBe(0)
    expect(graph.downstream.size).toBe(0)
  })

  it('identifies upstream and downstream relationships', () => {
    const graph = buildDependencyGraph({ e1: edge('A', 'B'), e2: edge('B', 'C') })
    expect(graph.upstream.get('B')?.has('A')).toBe(true)
    expect(graph.upstream.get('C')?.has('B')).toBe(true)
    expect(graph.downstream.get('A')?.has('B')).toBe(true)
    expect(graph.downstream.get('B')?.has('C')).toBe(true)
  })

  it('handles multiple upstream connections', () => {
    const graph = buildDependencyGraph({ e1: edge('A', 'C'), e2: edge('B', 'C') })
    expect(graph.upstream.get('C')?.has('A')).toBe(true)
    expect(graph.upstream.get('C')?.has('B')).toBe(true)
    expect(graph.upstream.get('C')?.size).toBe(2)
  })
})

describe('wouldCreateCycle', () => {
  it('detects a self-loop', () => {
    expect(wouldCreateCycle({}, 'A', 'A')).toBe(true)
  })

  it('detects a simple cycle', () => {
    expect(wouldCreateCycle({ e1: edge('A', 'B') }, 'B', 'A')).toBe(true)
  })

  it('detects a longer cycle', () => {
    const edges = { e1: edge('A', 'B'), e2: edge('B', 'C') }
    expect(wouldCreateCycle(edges, 'C', 'A')).toBe(true)
  })

  it('allows a valid connection', () => {
    expect(wouldCreateCycle({ e1: edge('A', 'B') }, 'B', 'C')).toBe(false)
  })

  it('allows a valid parallel connection', () => {
    expect(wouldCreateCycle({ e1: edge('A', 'C') }, 'B', 'C')).toBe(false)
  })

  it('allows a diamond structure', () => {
    const edges = {
      e1: edge('A', 'B'),
      e2: edge('A', 'C'),
      e3: edge('B', 'D'),
    }
    expect(wouldCreateCycle(edges, 'C', 'D')).toBe(false)
  })
})

describe('detectCycles', () => {
  it('returns no nodes for an acyclic graph', () => {
    expect(detectCycles(nodes('A', 'B'), { e1: edge('A', 'B') })).toEqual([])
  })
})

describe('getTopologicalOrder', () => {
  it('returns nodes in dependency order', () => {
    const order = getTopologicalOrder(
      nodes('A', 'B', 'C'),
      { e1: edge('A', 'B'), e2: edge('B', 'C') }
    )
    expect(order).not.toBeNull()
    if (order) {
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'))
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'))
    }
  })

  it('handles multiple roots', () => {
    const order = getTopologicalOrder(
      nodes('A', 'B', 'C'),
      { e1: edge('A', 'C'), e2: edge('B', 'C') }
    )
    expect(order).not.toBeNull()
    if (order) {
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'))
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'))
    }
  })

  it('handles disconnected nodes', () => {
    const order = getTopologicalOrder(nodes('A', 'B'), {})
    expect(order).not.toBeNull()
    expect(order?.length).toBe(2)
    expect(order).toContain('A')
    expect(order).toContain('B')
  })
})

describe('getComputationOrder', () => {
  it('returns only nodes needed for the target', () => {
    const graphNodes = nodes('A', 'B', 'C', 'D')
    const edges = {
      e1: edge('A', 'B'),
      e2: edge('A', 'C'),
      e3: edge('B', 'D'),
    }
    const order = getComputationOrder('D', graphNodes, edges)
    expect(order).toContain('A')
    expect(order).toContain('B')
    expect(order).toContain('D')
    expect(order).not.toContain('C')
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'))
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'))
  })
})
