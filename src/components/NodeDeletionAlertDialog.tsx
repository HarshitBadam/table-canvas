import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { getDependentNodeIds } from '@/engine/workflowGraph'
import { useApp } from '@/state/AppContext'
import { useProjectStore } from '@/state/projectStore'
import { NodeDeletionContext } from './nodeDeletionContext'

export function NodeDeletionProvider({ children }: { children: ReactNode }) {
  const nodes = useProjectStore((state) => state.nodes)
  const edges = useProjectStore((state) => state.edges)
  const { deleteNodeWithSync } = useApp()
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const requestNodeDeletion = useCallback((requestedNodeId: string, returnFocus?: HTMLElement | null) => {
    setNodeId((current) => {
      if (current) return current
      returnFocusRef.current = returnFocus ?? (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
      return requestedNodeId
    })
  }, [])

  const closeDialog = useCallback(() => {
    if (isDeleting) return
    setNodeId(null)
    requestAnimationFrame(() => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
      returnFocusRef.current = null
    })
  }, [isDeleting])

  const confirmDeletion = useCallback(async () => {
    if (!nodeId || isDeleting) return
    setIsDeleting(true)
    try {
      await deleteNodeWithSync(nodeId)
      setNodeId(null)
    } finally {
      setIsDeleting(false)
    }
  }, [deleteNodeWithSync, isDeleting, nodeId])

  const dependentCount = useMemo(
    () => nodeId ? getDependentNodeIds(nodes, edges, nodeId).size : 0,
    [edges, nodeId, nodes],
  )
  const nodeName = nodeId ? nodes[nodeId]?.name ?? 'this node' : 'this node'
  const contextValue = useMemo(() => ({
    requestNodeDeletion,
    deletionPending: nodeId !== null,
  }), [nodeId, requestNodeDeletion])

  return (
    <NodeDeletionContext.Provider value={contextValue}>
      {children}
      <Dialog.Root open={nodeId !== null} onOpenChange={(open) => !open && closeDialog()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/50" />
          <Dialog.Content
            role="alertdialog"
            className="fixed left-1/2 top-1/2 z-modal w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-elevation bg-surface p-5 shadow-xl focus:outline-none"
          >
            <Dialog.Title className="text-base font-semibold text-text-primary">
              Delete node?
            </Dialog.Title>
            <p className="mt-1 text-sm font-medium text-text-primary">
              {nodeName}
            </p>
            <Dialog.Description className="mt-3 text-sm leading-5 text-text-secondary">
              {dependentCount > 0
                ? `This also deletes ${dependentCount} dependent node${dependentCount === 1 ? '' : 's'} so the workflow remains valid. You can undo this change from the toolbar.`
                : 'This removes the node from the workflow. You can undo this change from the toolbar.'}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary" disabled={isDeleting}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void confirmDeletion()}
                disabled={isDeleting}
                className="btn bg-error text-white hover:bg-error/90 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </NodeDeletionContext.Provider>
  )
}
