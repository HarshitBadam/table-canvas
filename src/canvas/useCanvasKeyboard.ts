import { useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useWorkspaceLease } from '@/state/useWorkspaceLease'
import { useNodeDeletion } from '@/components/nodeDeletionContext'

/**
 * Deleting the selected node, which is the one keyboard action that only means
 * something on the canvas. Undo and redo are workspace-wide and handled once in
 * `useHistoryShortcuts`, so that the same keystroke does the same thing on every
 * view instead of only where a handler happened to be mounted.
 */
export function useCanvasKeyboard() {
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const { canEdit } = useWorkspaceLease()
  const { requestNodeDeletion, deletionPending } = useNodeDeletion()

  useEffect(() => {
    if (!canEdit) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null
      const isEditing = Boolean(
        target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
      )
      const isInDialog = Boolean(target?.closest('[role="dialog"], [role="alertdialog"]'))

      if (
        (e.key === 'Delete' || e.key === 'Backspace')
        && !isEditing
        && !isInDialog
        && !deletionPending
      ) {
        if (selectedNodeId) {
          e.preventDefault()
          requestNodeDeletion(selectedNodeId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canEdit, deletionPending, requestNodeDeletion, selectedNodeId])
}
