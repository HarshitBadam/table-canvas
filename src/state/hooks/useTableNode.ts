/**
 * useTableNode Hook
 * 
 * Selector hook for accessing table node data with memoization.
 */

import { useMemo } from 'react'
import { useProjectStore } from '../projectStore'
import type { TableNode, SourceTableNode, DerivedTableNode } from '@/types'

/**
 * Get a table node by ID with proper typing
 */
export function useTableNode(tableId: string): TableNode | undefined {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node as TableNode
    }
    return undefined
  })
}

/**
 * Get a source table node by ID
 */
export function useSourceTableNode(tableId: string): SourceTableNode | undefined {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    if (node?.kind === 'source_table') {
      return node as SourceTableNode
    }
    return undefined
  })
}

/**
 * Get a derived table node by ID
 */
export function useDerivedTableNode(tableId: string): DerivedTableNode | undefined {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    if (node?.kind === 'derived_table') {
      return node as DerivedTableNode
    }
    return undefined
  })
}

/**
 * Get table schema for a node
 */
export function useTableSchema(tableId: string) {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return (node as TableNode).schema
    }
    return undefined
  })
}

/**
 * Check if a table is editable (source tables are editable, derived are not)
 */
export function useIsTableEditable(tableId: string): boolean {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    return node?.kind === 'source_table'
  })
}

/**
 * Get cache info for a table node
 */
export function useTableCacheInfo(tableId: string) {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return (node as TableNode).cacheInfo
    }
    return undefined
  })
}

/**
 * Check if a table is dirty (needs recomputation)
 */
export function useIsTableDirty(tableId: string): boolean {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return (node as TableNode).cacheInfo?.isDirty ?? false
    }
    return false
  })
}

/**
 * Check if a table is currently computing
 */
export function useIsTableComputing(tableId: string): boolean {
  return useProjectStore((state) => {
    const node = state.nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return (node as TableNode).cacheInfo?.isComputing ?? false
    }
    return false
  })
}
