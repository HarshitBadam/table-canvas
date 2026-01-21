/**
 * Memoized Zustand Selectors
 * 
 * Provides optimized selectors for accessing project store state.
 * Uses useShallow from Zustand for efficient subscriptions.
 */

import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from './projectStore'
import type {
  ProjectNode,
  SourceTableNode,
  DerivedTableNode,
  TableNode,
  ChartNode,
  Edge,
  Patches,
  ColumnSchema,
} from '@/lib/types'
import {
  getIncomingEdges,
  getOutgoingEdges,
  getUpstreamNodeIds,
  getDownstreamNodeIds,
} from './stores/edgesSlice'

// ============================================================================
// Node Selectors
// ============================================================================

/**
 * Select a single node by ID.
 */
export function useNode(id: string): ProjectNode | undefined {
  return useProjectStore(state => state.nodes[id])
}

/**
 * Select a table node by ID (source or derived).
 */
export function useTableNode(id: string): TableNode | undefined {
  return useProjectStore(state => {
    const node = state.nodes[id]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node as TableNode
    }
    return undefined
  })
}

/**
 * Select a source table node by ID.
 */
export function useSourceTableNode(id: string): SourceTableNode | undefined {
  return useProjectStore(state => {
    const node = state.nodes[id]
    if (node?.kind === 'source_table') {
      return node as SourceTableNode
    }
    return undefined
  })
}

/**
 * Select a derived table node by ID.
 */
export function useDerivedTableNode(id: string): DerivedTableNode | undefined {
  return useProjectStore(state => {
    const node = state.nodes[id]
    if (node?.kind === 'derived_table') {
      return node as DerivedTableNode
    }
    return undefined
  })
}

/**
 * Select a chart node by ID.
 */
export function useChartNode(id: string): ChartNode | undefined {
  return useProjectStore(state => {
    const node = state.nodes[id]
    if (node?.kind === 'chart') {
      return node as ChartNode
    }
    return undefined
  })
}

/**
 * Select all nodes as an array.
 */
export function useAllNodes(): ProjectNode[] {
  return useProjectStore(useShallow(state => Object.values(state.nodes)))
}

/**
 * Select all table nodes (source and derived).
 */
export function useAllTableNodes(): TableNode[] {
  return useProjectStore(useShallow(state => 
    Object.values(state.nodes).filter(
      (n): n is TableNode => n.kind === 'source_table' || n.kind === 'derived_table'
    )
  ))
}

/**
 * Select all source table nodes.
 */
export function useAllSourceTables(): SourceTableNode[] {
  return useProjectStore(useShallow(state => 
    Object.values(state.nodes).filter(
      (n): n is SourceTableNode => n.kind === 'source_table'
    )
  ))
}

/**
 * Select all chart nodes.
 */
export function useAllChartNodes(): ChartNode[] {
  return useProjectStore(useShallow(state => 
    Object.values(state.nodes).filter(
      (n): n is ChartNode => n.kind === 'chart'
    )
  ))
}

/**
 * Select node count.
 */
export function useNodeCount(): number {
  return useProjectStore(state => Object.keys(state.nodes).length)
}

/**
 * Select node IDs.
 */
export function useNodeIds(): string[] {
  return useProjectStore(useShallow(state => Object.keys(state.nodes)))
}

// ============================================================================
// Schema Selectors
// ============================================================================

/**
 * Select schema for a table node.
 */
export function useTableSchema(tableId: string): { columns: ColumnSchema[]; rowCount: number } | undefined {
  return useProjectStore(state => {
    const node = state.nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node.schema
    }
    return undefined
  })
}

/**
 * Select columns for a table node.
 */
export function useTableColumns(tableId: string): ColumnSchema[] {
  return useProjectStore(useShallow(state => {
    const node = state.nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node.schema?.columns ?? []
    }
    return []
  }))
}

// ============================================================================
// Edge Selectors
// ============================================================================

/**
 * Select all edges as an array.
 */
export function useAllEdges(): Edge[] {
  return useProjectStore(useShallow(state => Object.values(state.edges)))
}

/**
 * Select edges connected to a node.
 */
export function useEdgesForNode(nodeId: string): Edge[] {
  return useProjectStore(useShallow(state => {
    const edges = Object.values(state.edges)
    return edges.filter(e => e.fromNodeId === nodeId || e.toNodeId === nodeId)
  }))
}

/**
 * Select incoming edges for a node.
 */
export function useIncomingEdges(nodeId: string): Edge[] {
  return useProjectStore(useShallow(state => getIncomingEdges(state.edges, nodeId)))
}

/**
 * Select outgoing edges for a node.
 */
export function useOutgoingEdges(nodeId: string): Edge[] {
  return useProjectStore(useShallow(state => getOutgoingEdges(state.edges, nodeId)))
}

/**
 * Select edge by ID.
 */
export function useEdge(id: string): Edge | undefined {
  return useProjectStore(state => state.edges[id])
}

// ============================================================================
// Dependency Graph Selectors
// ============================================================================

/**
 * Select all upstream node IDs for a node (ancestors).
 */
export function useUpstreamNodeIds(nodeId: string): string[] {
  return useProjectStore(useShallow(state => getUpstreamNodeIds(state.edges, nodeId)))
}

/**
 * Select all downstream node IDs for a node (descendants).
 */
export function useDownstreamNodeIds(nodeId: string): string[] {
  return useProjectStore(useShallow(state => getDownstreamNodeIds(state.edges, nodeId)))
}

/**
 * Select upstream nodes for a given node.
 */
export function useUpstreamNodes(nodeId: string): ProjectNode[] {
  return useProjectStore(useShallow(state => {
    const upstreamIds = getUpstreamNodeIds(state.edges, nodeId)
    return upstreamIds.map(id => state.nodes[id]).filter(Boolean)
  }))
}

/**
 * Select downstream nodes for a given node.
 */
export function useDownstreamNodes(nodeId: string): ProjectNode[] {
  return useProjectStore(useShallow(state => {
    const downstreamIds = getDownstreamNodeIds(state.edges, nodeId)
    return downstreamIds.map(id => state.nodes[id]).filter(Boolean)
  }))
}

/**
 * Select the dependency chain (all ancestors) for a node.
 */
export function useDependencyChain(nodeId: string): ProjectNode[] {
  return useUpstreamNodes(nodeId)
}

// ============================================================================
// Selection Selectors
// ============================================================================

/**
 * Select the currently selected node ID.
 */
export function useSelectedNodeId(): string | null {
  return useProjectStore(state => state.selectedNodeId)
}

/**
 * Select the currently selected edge ID.
 */
export function useSelectedEdgeId(): string | null {
  return useProjectStore(state => state.selectedEdgeId)
}

/**
 * Select the currently selected node.
 */
export function useSelectedNode(): ProjectNode | undefined {
  return useProjectStore(state => {
    if (!state.selectedNodeId) return undefined
    return state.nodes[state.selectedNodeId]
  })
}

/**
 * Select the currently selected edge.
 */
export function useSelectedEdge(): Edge | undefined {
  return useProjectStore(state => {
    if (!state.selectedEdgeId) return undefined
    return state.edges[state.selectedEdgeId]
  })
}

/**
 * Check if a specific node is selected.
 */
export function useIsNodeSelected(nodeId: string): boolean {
  return useProjectStore(state => state.selectedNodeId === nodeId)
}

/**
 * Check if a specific edge is selected.
 */
export function useIsEdgeSelected(edgeId: string): boolean {
  return useProjectStore(state => state.selectedEdgeId === edgeId)
}

// ============================================================================
// Patches Selectors
// ============================================================================

/**
 * Select patches for a table.
 */
export function usePatches(tableId: string): Patches | undefined {
  return useProjectStore(state => state.patches[tableId])
}

/**
 * Check if a table has any patches.
 */
export function useHasPatches(tableId: string): boolean {
  return useProjectStore(state => {
    const patches = state.patches[tableId]
    if (!patches) return false
    return (
      Object.keys(patches.cellPatches || {}).length > 0 ||
      (patches.deletedRows?.size ?? 0) > 0 ||
      (patches.insertedRows?.length ?? 0) > 0
    )
  })
}

// ============================================================================
// Project Metadata Selectors
// ============================================================================

/**
 * Select project metadata.
 */
export function useProjectMetadata(): { projectId: string; projectName: string } {
  return useProjectStore(useShallow(state => ({
    projectId: state.projectId,
    projectName: state.projectName,
  })))
}

/**
 * Select project name.
 */
export function useProjectName(): string {
  return useProjectStore(state => state.projectName)
}

// ============================================================================
// History Selectors
// ============================================================================

/**
 * Select undo/redo capability.
 */
export function useUndoRedo(): { canUndo: boolean; canRedo: boolean } {
  return useProjectStore(useShallow(state => ({
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
  })))
}

// ============================================================================
// Computed Selectors
// ============================================================================

/**
 * Select whether a node is dirty (needs recomputation).
 */
export function useIsNodeDirty(nodeId: string): boolean {
  return useProjectStore(state => {
    const node = state.nodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node.cacheInfo?.isDirty ?? false
    }
    return false
  })
}

/**
 * Select whether a node is currently computing.
 */
export function useIsNodeComputing(nodeId: string): boolean {
  return useProjectStore(state => {
    const node = state.nodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node.cacheInfo?.isComputing ?? false
    }
    return false
  })
}

/**
 * Select node error.
 */
export function useNodeError(nodeId: string): string | undefined {
  return useProjectStore(state => {
    const node = state.nodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node.cacheInfo?.error
    }
    return undefined
  })
}
