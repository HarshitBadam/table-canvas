import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { getStorageScope } from '@/persistence/storageScope'
import {
  isNodeScopedView,
  readWorkspaceView,
  resolveWorkspaceView,
  workspaceViewStorageKey,
  writeWorkspaceView,
} from './workspaceViewPersistence'
import type { ViewMode } from './viewNavigation'

export interface WorkspaceView {
  /** The view being shown, which is always one that can render right now. */
  activeView: ViewMode
  setActiveView: (view: ViewMode) => void
}

/**
 * Owns which view the workspace is showing, and remembers it across reloads.
 *
 * The view is remembered per document rather than per browser, because "where I
 * was" belongs to the project being worked on: switching projects should land
 * where that project was left, not where the previous one was. Documents are
 * scoped, so a guest session and a signed-in account never read each other's.
 *
 * Nothing is written for a document until that document has been read back,
 * which is what stops the `canvas` this starts on from being mistaken for a view
 * the user chose and overwriting the one being restored.
 */
export function useWorkspaceViewPersistence(): WorkspaceView {
  const projectId = useProjectStore((state) => state.projectId)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const selectNode = useProjectStore((state) => state.selectNode)

  const [requestedView, setRequestedView] = useState<ViewMode>('canvas')
  const restoredKeyRef = useRef<string | null>(null)
  const writtenRef = useRef<string | null>(null)

  /*
   * A node-scoped view without a node has nothing to draw. Deleting the open
   * table, or a mirror tab removing it, has to leave the workspace somewhere
   * real, so the canvas stands in for it.
   */
  const activeView = isNodeScopedView(requestedView) && !selectedNodeId ? 'canvas' : requestedView

  const setActiveView = useCallback((view: ViewMode) => setRequestedView(view), [])

  /*
   * Restoring reads the document's nodes, which are in the store before this
   * runs, so a node id that no longer resolves is recognised as stale here
   * rather than opening a view with nothing in it. Running before paint also
   * means the restored view is the first one drawn, not a flash of the canvas.
   */
  useLayoutEffect(() => {
    const key = workspaceViewStorageKey(getStorageScope(), projectId)
    if (restoredKeyRef.current === key) return
    restoredKeyRef.current = key

    const stored = readWorkspaceView(getStorageScope(), projectId)
    if (!stored) {
      setRequestedView('canvas')
      return
    }

    const { nodes } = useProjectStore.getState()
    const resolved = resolveWorkspaceView(stored, (nodeId) => nodes[nodeId]?.kind)
    setRequestedView(resolved.view)
    if (resolved.nodeId) selectNode(resolved.nodeId)
  }, [projectId, selectNode])

  useEffect(() => {
    const scope = getStorageScope()
    const key = workspaceViewStorageKey(scope, projectId)
    if (restoredKeyRef.current !== key) return

    const nodeId = isNodeScopedView(activeView) ? selectedNodeId : null

    // Selecting a node on the canvas does not change what is remembered, and
    // storage writes are synchronous, so an unchanged view is not rewritten on
    // every click.
    const written = [key, activeView, nodeId ?? ''].join('\u001f')
    if (writtenRef.current === written) return
    writtenRef.current = written

    writeWorkspaceView(scope, projectId, { view: activeView, nodeId })
  }, [activeView, projectId, selectedNodeId])

  return { activeView, setActiveView }
}
