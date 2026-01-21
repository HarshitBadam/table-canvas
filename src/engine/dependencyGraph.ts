/**
 * Dependency Graph Manager
 * 
 * Provides DAG (Directed Acyclic Graph) operations for managing table dependencies.
 * Used for:
 * - Cycle detection when creating new connections
 * - Topological sorting for computation order
 * - Finding ancestors/descendants for dirty propagation
 */

import type { Edge, ProjectNode } from '@/lib/types'

// ============================================================================
// Types
// ============================================================================

export interface DependencyGraph {
  // Maps nodeId -> Set of nodeIds that this node depends on (upstream/parents)
  upstream: Map<string, Set<string>>
  // Maps nodeId -> Set of nodeIds that depend on this node (downstream/children)
  downstream: Map<string, Set<string>>
}

// Color marking for DFS cycle detection
type NodeColor = 'white' | 'gray' | 'black'

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Build a dependency graph from edges
 */
export function buildDependencyGraph(edges: Record<string, Edge>): DependencyGraph {
  const upstream = new Map<string, Set<string>>()
  const downstream = new Map<string, Set<string>>()
  
  for (const edge of Object.values(edges)) {
    const { fromNodeId, toNodeId } = edge
    
    // fromNodeId -> toNodeId means toNodeId depends on fromNodeId
    // So fromNodeId is upstream of toNodeId
    // And toNodeId is downstream of fromNodeId
    
    // Add to downstream map (fromNodeId's children)
    if (!downstream.has(fromNodeId)) {
      downstream.set(fromNodeId, new Set())
    }
    downstream.get(fromNodeId)!.add(toNodeId)
    
    // Add to upstream map (toNodeId's parents)
    if (!upstream.has(toNodeId)) {
      upstream.set(toNodeId, new Set())
    }
    upstream.get(toNodeId)!.add(fromNodeId)
  }
  
  return { upstream, downstream }
}

// ============================================================================
// Cycle Detection
// ============================================================================

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
  // Self-loop is always a cycle
  if (sourceId === targetId) {
    return true
  }
  
  const graph = buildDependencyGraph(edges)
  
  // A cycle would occur if we can reach sourceId starting from targetId
  // by following downstream edges (i.e., sourceId is already reachable from targetId)
  // Because adding targetId -> sourceId edge would then complete a cycle
  
  // Wait, the edge goes FROM sourceId TO targetId
  // So after adding: sourceId -> targetId
  // A cycle exists if targetId can reach sourceId through existing paths
  // i.e., if sourceId is downstream of targetId
  
  // Actually, let me think again:
  // Edge: fromNodeId -> toNodeId means "toNodeId depends on fromNodeId"
  // New edge: sourceId -> targetId means "targetId will depend on sourceId"
  // 
  // A cycle would occur if sourceId already depends on targetId (directly or indirectly)
  // i.e., if we can reach sourceId by following downstream edges from targetId
  
  return isReachable(graph.downstream, targetId, sourceId)
}

/**
 * Check if targetId is reachable from sourceId by following edges in the adjacency map.
 */
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
  const graph = buildDependencyGraph(edges)
  const colors = new Map<string, NodeColor>()
  const cycleNodes: string[] = []
  
  // Initialize all nodes as white (unvisited)
  for (const nodeId of Object.keys(nodes)) {
    colors.set(nodeId, 'white')
  }
  
  function dfs(nodeId: string): boolean {
    colors.set(nodeId, 'gray') // Mark as being processed
    
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
    
    colors.set(nodeId, 'black') // Mark as fully processed
    return false
  }
  
  // Run DFS from each unvisited node
  for (const nodeId of Object.keys(nodes)) {
    if (colors.get(nodeId) === 'white') {
      dfs(nodeId)
    }
  }
  
  return cycleNodes
}

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Get nodes in topological order (dependencies before dependents).
 * This determines the order in which tables should be computed.
 * 
 * @returns Array of node IDs in computation order, or null if graph has cycles
 */
export function getTopologicalOrder(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] | null {
  const graph = buildDependencyGraph(edges)
  const result: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>() // For cycle detection
  
  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) {
      // Cycle detected
      return false
    }
    
    if (visited.has(nodeId)) {
      return true
    }
    
    visiting.add(nodeId)
    
    // Visit all dependencies (upstream nodes) first
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
  
  // Visit all nodes
  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      if (!visit(nodeId)) {
        return null // Cycle detected
      }
    }
  }
  
  return result
}

/**
 * Get computation order for a specific node and its dependencies.
 * Returns nodes in the order they should be computed to materialize the target node.
 */
export function getComputationOrder(
  targetNodeId: string,
  _nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] {
  const graph = buildDependencyGraph(edges)
  const result: string[] = []
  const visited = new Set<string>()
  
  function visit(nodeId: string): void {
    if (visited.has(nodeId)) {
      return
    }
    
    // Visit dependencies first
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

// ============================================================================
// Ancestor/Descendant Queries
// ============================================================================

/**
 * Get all descendants of a node (nodes that depend on this node, directly or indirectly).
 * Used for dirty propagation - when a node changes, all descendants become dirty.
 */
export function getAllDescendants(
  nodeId: string,
  edges: Record<string, Edge>
): Set<string> {
  const graph = buildDependencyGraph(edges)
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
  const graph = buildDependencyGraph(edges)
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

/**
 * Get direct upstream nodes (immediate dependencies).
 */
export function getDirectUpstream(
  nodeId: string,
  edges: Record<string, Edge>
): Set<string> {
  const graph = buildDependencyGraph(edges)
  return graph.upstream.get(nodeId) ?? new Set()
}

/**
 * Get direct downstream nodes (immediate dependents).
 */
export function getDirectDownstream(
  nodeId: string,
  edges: Record<string, Edge>
): Set<string> {
  const graph = buildDependencyGraph(edges)
  return graph.downstream.get(nodeId) ?? new Set()
}

// ============================================================================
// Graph Analysis Utilities
// ============================================================================

/**
 * Get the depth of a node in the dependency graph.
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
  
  const graph = buildDependencyGraph(edges)
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

/**
 * Check if nodeA is an ancestor of nodeB (nodeB depends on nodeA).
 */
export function isAncestorOf(
  nodeA: string,
  nodeB: string,
  edges: Record<string, Edge>
): boolean {
  const ancestors = getAllAncestors(nodeB, edges)
  return ancestors.has(nodeA)
}

/**
 * Check if nodeA is a descendant of nodeB (nodeA depends on nodeB).
 */
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
  const graph = buildDependencyGraph(edges)
  const roots: string[] = []
  
  for (const nodeId of Object.keys(nodes)) {
    const upstream = graph.upstream.get(nodeId)
    if (!upstream || upstream.size === 0) {
      roots.push(nodeId)
    }
  }
  
  return roots
}

/**
 * Get all leaf nodes (nodes with no downstream dependents).
 */
export function getLeafNodes(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>
): string[] {
  const graph = buildDependencyGraph(edges)
  const leaves: string[] = []
  
  for (const nodeId of Object.keys(nodes)) {
    const downstream = graph.downstream.get(nodeId)
    if (!downstream || downstream.size === 0) {
      leaves.push(nodeId)
    }
  }
  
  return leaves
}
