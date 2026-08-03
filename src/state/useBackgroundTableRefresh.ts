import { useEffect, useMemo, useRef } from 'react'
import { getNodeDepth, getTopologicalOrder } from '@/engine/dependencyGraph'
import { ensureTableMaterialized } from '@/engine/materializationService'
import type { CacheInfo, Edge, ProjectNode } from '@/types'
import { useProjectStore } from './projectStore'
import { getNodeCacheInfo, useTableRuntimeStore } from './tableRuntimeStore'

const REFRESH_DEBOUNCE_MS = 350

function estimateTableSize(node: ProjectNode | undefined, cacheInfo: CacheInfo | undefined): number {
  const schemaRowCount = node && 'schema' in node ? node.schema?.rowCount : undefined
  return cacheInfo?.lastRowCount ?? schemaRowCount ?? 0
}

/**
 * Dirty tables in dependency order, then smallest-first within a level, so one
 * huge table does not block unrelated small tables in the shared materialization queue.
 */
export function getDirtyTableRefreshOrder(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  cacheInfo: Record<string, CacheInfo>,
): string[] {
  const topologicalOrder = getTopologicalOrder(nodes, edges)
  const dirtyIds = (topologicalOrder ?? Object.keys(nodes)).filter((id) => {
    const node = nodes[id]
    return (
      (node?.kind === 'source_table' || node?.kind === 'derived_table')
      && cacheInfo[id]?.isDirty === true
    )
  })
  // A cycle means getTopologicalOrder already gave up on dependency ordering;
  // getNodeDepth would recurse forever on the same cycle, so leave this order alone.
  if (!topologicalOrder) return dirtyIds

  const depthCache = new Map<string, number>()
  return [...dirtyIds].sort((a, b) => {
    const depthDiff = getNodeDepth(a, edges, depthCache) - getNodeDepth(b, edges, depthCache)
    if (depthDiff !== 0) return depthDiff
    return estimateTableSize(nodes[a], cacheInfo[a]) - estimateTableSize(nodes[b], cacheInfo[b])
  })
}

/**
 * Silently rematerializes dirty downstream tables after an edit burst (open grid/
 * chart readers already materialize on demand). Silence avoids Updating-badge flash on undo/redo.
 */
export function useBackgroundTableRefresh(enabled: boolean): void {
  const projectId = useProjectStore(state => state.projectId)
  const nodes = useProjectStore(state => state.nodes)
  const edges = useProjectStore(state => state.edges)
  const cacheInfo = useTableRuntimeStore(state => state.cacheInfo)
  const refreshOrder = useMemo(
    () => getDirtyTableRefreshOrder(nodes, edges, cacheInfo),
    [cacheInfo, edges, nodes],
  )
  const refreshKey = refreshOrder.join('|')
  // prepareProjectState dirties every table on load; the first drain is that warm-up,
  // so start immediately and clear small-table loading badges inside the canvas
  // anti-flash window instead of waiting out the edit debounce.
  const initialDrainProjectIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !projectId || !refreshKey) return
    const scheduledOrder = refreshKey.split('|')
    const isInitialDrain = initialDrainProjectIdRef.current !== projectId
    initialDrainProjectIdRef.current = projectId

    const timer = window.setTimeout(() => {
      void (async () => {
        for (const tableId of scheduledOrder) {
          if (useProjectStore.getState().projectId !== projectId) return
          if (!getNodeCacheInfo(tableId)?.isDirty) continue
          await ensureTableMaterialized(tableId, { announce: false })
        }
      })().catch(error => {
        console.error('[TableRefresh] Background refresh failed:', error)
      })
    }, isInitialDrain ? 0 : REFRESH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [enabled, projectId, refreshKey])
}
