import { useEffect, useMemo, useRef } from 'react'
import { getNodeDepth, getTopologicalOrder } from '@/engine/dependencyGraph'
import { ensureTableMaterialized } from '@/engine/materializationService'
import type { CacheInfo, Edge, ProjectNode } from '@/types'
import { useProjectStore } from './projectStore'
import { getNodeCacheInfo, useTableRuntimeStore } from './tableRuntimeStore'

const REFRESH_DEBOUNCE_MS = 350

/** Best known row count for a table we have not (re)materialized in this tab yet. */
function estimateTableSize(node: ProjectNode | undefined, cacheInfo: CacheInfo | undefined): number {
  const schemaRowCount = node && 'schema' in node ? node.schema?.rowCount : undefined
  return cacheInfo?.lastRowCount ?? schemaRowCount ?? 0
}

/**
 * Dirty tables in an order that respects dependencies (a table always comes after
 * everything it reads from) and, within that constraint, smallest first. A single
 * huge table landing first in the shared materialization queue would otherwise make
 * every unrelated small table sit and wait behind it before its own turn comes up.
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
 * Recomputes stale tables after an edit burst. Grid and chart readers materialize
 * their own table on demand; this fills the gap for downstream tables that are not
 * currently open. Progress is silent so undo/redo does not flash Updating badges
 * across the canvas.
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
  // prepareProjectState marks every table dirty as soon as a project loads, so the
  // very first drain for a project is that load's warm-up, not an edit burst — start
  // it immediately so small tables finish (and clear their loading badge) inside the
  // canvas node's own anti-flash window instead of waiting out the debounce first.
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
