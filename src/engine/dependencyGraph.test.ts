import { describe, it, expect } from 'vitest'
import {
  buildDependencyGraph,
  wouldCreateCycle,
  detectCycles,
  getTopologicalOrder,
  getComputationOrder,
  getAllDescendants,
  getAllAncestors,
  getDirectUpstream,
  getDirectDownstream,
  getNodeDepth,
  isAncestorOf,
  isDescendantOf,
  getRootNodes,
  getLeafNodes,
} from './dependencyGraph'
import type { Edge, ProjectNode, SourceTableNode, DerivedTableNode } from '@/lib/types'

// ============================================================================
// Test Fixtures
// ============================================================================

function createSourceTable(id: string, name: string): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: `file_${id}`,
      fileName: `${name}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createDerivedTable(id: string, name: string, upstreamIds: string[]): DerivedTableNode {
  return {
    id,
    kind: 'derived_table',
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      transformDef: {
        type: 'filter',
        sourceTableId: upstreamIds[0] || '',
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: upstreamIds,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createEdge(from: string, to: string, index: number = 0): Edge {
  return {
    id: `edge_${from}_${to}_${index}`,
    fromNodeId: from,
    toNodeId: to,
    transformType: 'filter',
  }
}

// ============================================================================
// buildDependencyGraph Tests
// ============================================================================

describe('buildDependencyGraph', () => {
  it('should build empty graph for empty edges', () => {
    const graph = buildDependencyGraph({})
    expect(graph.upstream.size).toBe(0)
    expect(graph.downstream.size).toBe(0)
  })

  it('should correctly identify upstream and downstream relationships', () => {
    // A -> B -> C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    const graph = buildDependencyGraph(edges)

    // B's upstream is A
    expect(graph.upstream.get('B')?.has('A')).toBe(true)
    // C's upstream is B
    expect(graph.upstream.get('C')?.has('B')).toBe(true)
    // A's downstream is B
    expect(graph.downstream.get('A')?.has('B')).toBe(true)
    // B's downstream is C
    expect(graph.downstream.get('B')?.has('C')).toBe(true)
  })

  it('should handle multiple upstream connections (join scenario)', () => {
    // A -> C <- B (join)
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'C'),
      e2: createEdge('B', 'C'),
    }

    const graph = buildDependencyGraph(edges)

    // C has both A and B as upstream
    expect(graph.upstream.get('C')?.has('A')).toBe(true)
    expect(graph.upstream.get('C')?.has('B')).toBe(true)
    expect(graph.upstream.get('C')?.size).toBe(2)
  })
})

// ============================================================================
// Cycle Detection Tests
// ============================================================================

describe('wouldCreateCycle', () => {
  it('should detect self-loop as cycle', () => {
    const edges: Record<string, Edge> = {}
    expect(wouldCreateCycle(edges, 'A', 'A')).toBe(true)
  })

  it('should detect simple cycle', () => {
    // Existing: A -> B
    // Trying to add: B -> A (would create A -> B -> A)
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
    }

    expect(wouldCreateCycle(edges, 'B', 'A')).toBe(true)
  })

  it('should detect longer cycle', () => {
    // Existing: A -> B -> C
    // Trying to add: C -> A (would create A -> B -> C -> A)
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    expect(wouldCreateCycle(edges, 'C', 'A')).toBe(true)
  })

  it('should allow valid connections (no cycle)', () => {
    // Existing: A -> B
    // Trying to add: B -> C (valid, extends chain)
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
    }

    expect(wouldCreateCycle(edges, 'B', 'C')).toBe(false)
  })

  it('should allow valid parallel connections', () => {
    // Existing: A -> C, B (unconnected)
    // Trying to add: B -> C (valid, creates join-like structure)
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'C'),
    }

    expect(wouldCreateCycle(edges, 'B', 'C')).toBe(false)
  })

  it('should allow diamond structure (not a cycle)', () => {
    //     A
    //    / \
    //   B   C
    //    \ /
    //     D
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('A', 'C'),
      e3: createEdge('B', 'D'),
    }

    // Adding C -> D is valid (creates diamond)
    expect(wouldCreateCycle(edges, 'C', 'D')).toBe(false)
  })
})

describe('detectCycles', () => {
  it('should return empty array for acyclic graph', () => {
    const nodes: Record<string, ProjectNode> = {
      A: createSourceTable('A', 'Table A'),
      B: createDerivedTable('B', 'Table B', ['A']),
    }
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
    }

    const cycles = detectCycles(nodes, edges)
    expect(cycles).toEqual([])
  })
})

// ============================================================================
// Topological Sort Tests
// ============================================================================

describe('getTopologicalOrder', () => {
  it('should return nodes in dependency order', () => {
    // A -> B -> C
    const nodes: Record<string, ProjectNode> = {
      A: createSourceTable('A', 'Table A'),
      B: createDerivedTable('B', 'Table B', ['A']),
      C: createDerivedTable('C', 'Table C', ['B']),
    }
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    const order = getTopologicalOrder(nodes, edges)

    expect(order).not.toBeNull()
    if (order) {
      // A should come before B, B should come before C
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'))
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'))
    }
  })

  it('should handle multiple root nodes', () => {
    // A -> C, B -> C
    const nodes: Record<string, ProjectNode> = {
      A: createSourceTable('A', 'Table A'),
      B: createSourceTable('B', 'Table B'),
      C: createDerivedTable('C', 'Table C', ['A', 'B']),
    }
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'C'),
      e2: createEdge('B', 'C'),
    }

    const order = getTopologicalOrder(nodes, edges)

    expect(order).not.toBeNull()
    if (order) {
      // Both A and B should come before C
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'))
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'))
    }
  })

  it('should handle disconnected nodes', () => {
    const nodes: Record<string, ProjectNode> = {
      A: createSourceTable('A', 'Table A'),
      B: createSourceTable('B', 'Table B'),
    }
    const edges: Record<string, Edge> = {}

    const order = getTopologicalOrder(nodes, edges)

    expect(order).not.toBeNull()
    expect(order?.length).toBe(2)
    expect(order).toContain('A')
    expect(order).toContain('B')
  })
})

describe('getComputationOrder', () => {
  it('should return only nodes needed to compute target', () => {
    //     A
    //    / \
    //   B   C
    //   |
    //   D
    const nodes: Record<string, ProjectNode> = {
      A: createSourceTable('A', 'Table A'),
      B: createDerivedTable('B', 'Table B', ['A']),
      C: createDerivedTable('C', 'Table C', ['A']),
      D: createDerivedTable('D', 'Table D', ['B']),
    }
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('A', 'C'),
      e3: createEdge('B', 'D'),
    }

    // Computing D should not require C
    const order = getComputationOrder('D', nodes, edges)

    expect(order).toContain('A')
    expect(order).toContain('B')
    expect(order).toContain('D')
    expect(order).not.toContain('C')

    // A should come before B, B should come before D
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'))
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'))
  })
})

// ============================================================================
// Ancestor/Descendant Tests
// ============================================================================

describe('getAllDescendants', () => {
  it('should find all descendants', () => {
    // A -> B -> C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    const descendants = getAllDescendants('A', edges)

    expect(descendants.has('B')).toBe(true)
    expect(descendants.has('C')).toBe(true)
    expect(descendants.has('A')).toBe(false) // Should not include self
  })

  it('should handle branching', () => {
    //     A
    //    / \
    //   B   C
    //   |
    //   D
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('A', 'C'),
      e3: createEdge('B', 'D'),
    }

    const descendants = getAllDescendants('A', edges)

    expect(descendants.has('B')).toBe(true)
    expect(descendants.has('C')).toBe(true)
    expect(descendants.has('D')).toBe(true)
    expect(descendants.size).toBe(3)
  })

  it('should return empty set for leaf nodes', () => {
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
    }

    const descendants = getAllDescendants('B', edges)
    expect(descendants.size).toBe(0)
  })
})

describe('getAllAncestors', () => {
  it('should find all ancestors', () => {
    // A -> B -> C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    const ancestors = getAllAncestors('C', edges)

    expect(ancestors.has('A')).toBe(true)
    expect(ancestors.has('B')).toBe(true)
    expect(ancestors.has('C')).toBe(false) // Should not include self
  })

  it('should handle multiple parents (join)', () => {
    // A -> C <- B
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'C'),
      e2: createEdge('B', 'C'),
    }

    const ancestors = getAllAncestors('C', edges)

    expect(ancestors.has('A')).toBe(true)
    expect(ancestors.has('B')).toBe(true)
    expect(ancestors.size).toBe(2)
  })

  it('should return empty set for root nodes', () => {
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
    }

    const ancestors = getAllAncestors('A', edges)
    expect(ancestors.size).toBe(0)
  })
})

describe('getDirectUpstream and getDirectDownstream', () => {
  it('should return only direct relationships', () => {
    // A -> B -> C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    // B's direct upstream is only A
    const upstream = getDirectUpstream('B', edges)
    expect(upstream.has('A')).toBe(true)
    expect(upstream.size).toBe(1)

    // B's direct downstream is only C
    const downstream = getDirectDownstream('B', edges)
    expect(downstream.has('C')).toBe(true)
    expect(downstream.size).toBe(1)
  })
})

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getNodeDepth', () => {
  it('should return 0 for root nodes', () => {
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
    }

    expect(getNodeDepth('A', edges)).toBe(0)
  })

  it('should return correct depth for chain', () => {
    // A -> B -> C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    expect(getNodeDepth('A', edges)).toBe(0)
    expect(getNodeDepth('B', edges)).toBe(1)
    expect(getNodeDepth('C', edges)).toBe(2)
  })

  it('should return max depth for multiple parents', () => {
    //   A      D
    //    \    /
    //     B  /
    //      \/
    //       C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
      e3: createEdge('D', 'C'),
    }

    // C has depth 2 (through A -> B -> C) even though D -> C is depth 1
    expect(getNodeDepth('C', edges)).toBe(2)
  })
})

describe('isAncestorOf and isDescendantOf', () => {
  it('should correctly identify ancestor relationships', () => {
    // A -> B -> C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    expect(isAncestorOf('A', 'C', edges)).toBe(true)
    expect(isAncestorOf('A', 'B', edges)).toBe(true)
    expect(isAncestorOf('C', 'A', edges)).toBe(false)
  })

  it('should correctly identify descendant relationships', () => {
    // A -> B -> C
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
    }

    expect(isDescendantOf('C', 'A', edges)).toBe(true)
    expect(isDescendantOf('B', 'A', edges)).toBe(true)
    expect(isDescendantOf('A', 'C', edges)).toBe(false)
  })
})

describe('getRootNodes and getLeafNodes', () => {
  it('should identify root nodes', () => {
    // A -> B, C -> D
    const nodes: Record<string, ProjectNode> = {
      A: createSourceTable('A', 'A'),
      B: createDerivedTable('B', 'B', ['A']),
      C: createSourceTable('C', 'C'),
      D: createDerivedTable('D', 'D', ['C']),
    }
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('C', 'D'),
    }

    const roots = getRootNodes(nodes, edges)

    expect(roots).toContain('A')
    expect(roots).toContain('C')
    expect(roots).not.toContain('B')
    expect(roots).not.toContain('D')
  })

  it('should identify leaf nodes', () => {
    // A -> B -> C, B -> D
    const nodes: Record<string, ProjectNode> = {
      A: createSourceTable('A', 'A'),
      B: createDerivedTable('B', 'B', ['A']),
      C: createDerivedTable('C', 'C', ['B']),
      D: createDerivedTable('D', 'D', ['B']),
    }
    const edges: Record<string, Edge> = {
      e1: createEdge('A', 'B'),
      e2: createEdge('B', 'C'),
      e3: createEdge('B', 'D'),
    }

    const leaves = getLeafNodes(nodes, edges)

    expect(leaves).toContain('C')
    expect(leaves).toContain('D')
    expect(leaves).not.toContain('A')
    expect(leaves).not.toContain('B')
  })
})
