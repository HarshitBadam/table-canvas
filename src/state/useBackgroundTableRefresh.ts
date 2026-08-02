import { useEffect, useMemo } from 'react'
import { getTopologicalOrder } from '@/engine/dependencyGraph'
import { ensureTableMaterialized } from '@/engine/materializationService'
import type { CacheInfo, Edge, ProjectNode } from '@/types'
import { useProjectStore } from './projectStore'
import { getNodeCacheInfo, useTableRuntimeStore } from './tableRuntimeStore'

const REFRESH_DEBOUNCE_MS = 350

export function getDirtyTableRefreshOrder(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  cacheInfo: Record<string, CacheInfo>,
): string[] {
  const topologicalOrder = getTopologicalOrder(nodes, edges) ?? Object.keys(nodes)
  return topologicalOrder.filter((id) => {
    const node = nodes[id]
    return (
      (node?.kind === 'source_table' || node?.kind === 'derived_table')
      && cacheInfo[id]?.isDirty === true
    )
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

  useEffect(() => {
    if (!enabled || !projectId || !refreshKey) return
    const scheduledOrder = refreshKey.split('|')

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
    }, REFRESH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [enabled, projectId, refreshKey])
}
