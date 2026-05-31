import type { Edge, ProjectNode } from '@/types'


export interface DependencyGraph {
  // Maps nodeId -> Set of nodeIds that this node depends on (upstream/parents)
  upstream: Map<string, Set<string>>
  // Maps nodeId -> Set of nodeIds that depend on this node (downstream/children)
  downstream: Map<string, Set<string>>
}

// Color marking for DFS cycle detection
type NodeColor = 'white' | 'gray' | 'black'


export function buildDependencyGraph(edges: Record<string, Edge>): DependencyGraph {
  const upstream = new Map<string, Set<string>>()
  const downstream = new Map<string, Set<string>>()
  
  for (const edge of Object.values(edges)) {
    const { fromNodeId, toNodeId } = edge
    
    // fromNodeId -> toNodeId means toNodeId depends on fromNodeId
    // So fromNodeId is upstream of toNodeId
    // And toNodeId is downstream of fromNodeId
    
    if (!downstream.has(fromNodeId)) {
      downstream.set(fromNodeId, new Set())
    }
    downstream.get(fromNodeId)!.add(toNodeId)
    
    if (!upstream.has(toNodeId)) {
      upstream.set(toNodeId, new Set())
    }
    upstream.get(toNodeId)!.add(fromNodeId)
  }
  
  return { upstream, downstream }
}

// Single-entry memoization: avoids rebuilding the graph when the same edges
// reference is passed to multiple helper functions in a single call chain.
let _memoEdges: Record<string, Edge> | null = null
let _memoGraph: DependencyGraph | null = null

function getCachedGraph(edges: Record<string, Edge>): DependencyGraph {
  if (edges !== _memoEdges) {
    _memoEdges = edges
    _memoGraph = buildDependencyGraph(edges)
  }
  return _memoGraph!
}


/**
 * Check if adding an edge from sourceId to targetId would create a cycle.
 * Uses DFS with color marking (white/gray/black algorithm).
 * 
 * A cycle would be created if targetId can already reach sourceId through
 * existing edges (i.e., sourceId is a descendant of targetId).
 * 
 * @param edges - Current edges in the graph
 * @param sourceId - The node the new edge would come FROM
 * @param targetId - The node the new edge would go TO
 * @returns true if adding this edge would create a cycle
 */
export function wouldCreateCycle(
  edges: Record<string, Edge>,
  sourceId: string,
  targetId: string
): boolean {
  if (sourceId === targetId) {
    return true
  }
  
  const graph = getCachedGraph(edges)
  
  // A cycle would occur if we can reach sourceId starting from targetId
  // by following downstream edges (i.e., sourceId is already reachable from targetId)
  // Because adding targetId -> sourceId edge would then complete a cycle
  
  return isReachable(graph.downstream, targetId, sourceId)
}

function isReachable(
  adjacency: Map<string, Set<string>>,
  sourceId: string,
  targetId: string
): boolean {
  const visited = new Set<string>()
  const stack = [sourceId]
  
  while (stack.length > 0) {
    const current = stack.pop()!
    
    if (current === targetId) {
      return true
    }
    
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    
    const neighbors = adjacency.get(current)
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor)
        }
      }
    }
  }
  
  return false
}

/**
 * Detect if the current graph has any cycles.
 * Uses DFS with three-color marking.
 * 
 * @returns Array of node IDs involved in cycles, or empty array if no cycles
 */
export function detectCycles(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] {
  const graph = getCachedGraph(edges)
  const colors = new Map<string, NodeColor>()
  const cycleNodes: string[] = []
  
  for (const nodeId of Object.keys(nodes)) {
    colors.set(nodeId, 'white')
  }
  
  function dfs(nodeId: string): boolean {
    colors.set(nodeId, 'gray')
    
    const children = graph.downstream.get(nodeId)
    if (children) {
      for (const childId of children) {
        const childColor = colors.get(childId) ?? 'white'
        
        if (childColor === 'gray') {
          // Found a back edge - cycle detected
          cycleNodes.push(nodeId)
          return true
        }
        
        if (childColor === 'white') {
          if (dfs(childId)) {
            cycleNodes.push(nodeId)
            return true
          }
        }
      }
    }
    
    colors.set(nodeId, 'black')
    return false
  }
  
  for (const nodeId of Object.keys(nodes)) {
    if (colors.get(nodeId) === 'white') {
      dfs(nodeId)
    }
  }
  
  return cycleNodes
}


/**
 * @returns Array of node IDs in computation order, or null if graph has cycles
 */
export function getTopologicalOrder(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] | null {
  const graph = getCachedGraph(edges)
  const result: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  
  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) {
      return false
    }
    
    if (visited.has(nodeId)) {
      return true
    }
    
    visiting.add(nodeId)
    
    const upstreamNodes = graph.upstream.get(nodeId)
    if (upstreamNodes) {
      for (const upstreamId of upstreamNodes) {
        if (!visit(upstreamId)) {
          return false
        }
      }
    }
    
    visiting.delete(nodeId)
    visited.add(nodeId)
    result.push(nodeId)
    
    return true
  }
  
  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      if (!visit(nodeId)) {
        return null
      }
    }
  }
  
  return result
}

export function getComputationOrder(
  targetNodeId: string,
  _nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] {
  const graph = getCachedGraph(edges)
  const result: string[] = []
  const visited = new Set<string>()
  
  function visit(nodeId: string): void {
    if (visited.has(nodeId)) {
      return
    }
    
    const upstreamNodes = graph.upstream.get(nodeId)
    if (upstreamNodes) {
      for (const upstreamId of upstreamNodes) {
        visit(upstreamId)
      }
    }
    
    visited.add(nodeId)
    result.push(nodeId)
  }
  
  visit(targetNodeId)
  return result
}


/**
 * Used for dirty propagation - when a node changes, all descendants become dirty.
 */
export function getAllDescendants(
  nodeId: string,
  edges: Record<string, Edge>
): Set<string> {
  const graph = getCachedGraph(edges)
  const descendants = new Set<string>()
  const stack = [nodeId]
  
  while (stack.length > 0) {
    const current = stack.pop()!
    
    const children = graph.downstream.get(current)
    if (children) {
      for (const childId of children) {
        if (!descendants.has(childId)) {
          descendants.add(childId)
          stack.push(childId)
        }
      }
    }
  }
  
  return descendants
}

/**
 * Get all ancestors of a node (nodes that this node depends on, directly or indirectly).
 * Used to determine what needs to be computed before this node.
 */
export function getAllAncestors(
  nodeId: string,
  edges: Record<string, Edge>
): Set<string> {
  const graph = getCachedGraph(edges)
  const ancestors = new Set<string>()
  const stack = [nodeId]
  
  while (stack.length > 0) {
    const current = stack.pop()!
    
    const parents = graph.upstream.get(current)
    if (parents) {
      for (const parentId of parents) {
        if (!ancestors.has(parentId)) {
          ancestors.add(parentId)
          stack.push(parentId)
        }
      }
    }
  }
  
  return ancestors
}

export function getDirectUpstream(
  nodeId: string,
  edges: Record<string, Edge>
): Set<string> {
  const graph = getCachedGraph(edges)
  return graph.upstream.get(nodeId) ?? new Set()
}

export function getDirectDownstream(
  nodeId: string,
  edges: Record<string, Edge>
): Set<string> {
  const graph = getCachedGraph(edges)
  return graph.downstream.get(nodeId) ?? new Set()
}


/**
 * Source tables (no dependencies) have depth 0.
 * Derived tables have depth = max(upstream depths) + 1.
 */
export function getNodeDepth(
  nodeId: string,
  edges: Record<string, Edge>,
  cache: Map<string, number> = new Map()
): number {
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!
  }
  
  const graph = getCachedGraph(edges)
  const upstream = graph.upstream.get(nodeId)
  
  if (!upstream || upstream.size === 0) {
    cache.set(nodeId, 0)
    return 0
  }
  
  let maxUpstreamDepth = 0
  for (const upstreamId of upstream) {
    const depth = getNodeDepth(upstreamId, edges, cache)
    maxUpstreamDepth = Math.max(maxUpstreamDepth, depth)
  }
  
  const depth = maxUpstreamDepth + 1
  cache.set(nodeId, depth)
  return depth
}

export function isAncestorOf(
  nodeA: string,
  nodeB: string,
  edges: Record<string, Edge>
): boolean {
  const ancestors = getAllAncestors(nodeB, edges)
  return ancestors.has(nodeA)
}

export function isDescendantOf(
  nodeA: string,
  nodeB: string,
  edges: Record<string, Edge>
): boolean {
  const descendants = getAllDescendants(nodeB, edges)
  return descendants.has(nodeA)
}

/**
 * Get all root nodes (nodes with no upstream dependencies - source tables).
 */
export function getRootNodes(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] {
  const graph = getCachedGraph(edges)
  const roots: string[] = []
  
  for (const nodeId of Object.keys(nodes)) {
    const upstream = graph.upstream.get(nodeId)
    if (!upstream || upstream.size === 0) {
      roots.push(nodeId)
    }
  }
  
  return roots
}

export function getLeafNodes(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] {
  const graph = getCachedGraph(edges)
  const leaves: string[] = []
  
  for (const nodeId of Object.keys(nodes)) {
    const downstream = graph.downstream.get(nodeId)
    if (!downstream || downstream.size === 0) {
      leaves.push(nodeId)
    }
  }
  
  return leaves
}
