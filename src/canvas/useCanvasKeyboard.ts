import { useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useWorkspaceLease } from '@/state/document/useWorkspaceLease'
import { useNodeDeletion } from '@/canvas/node-deletion/nodeDeletionContext'

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
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null
      const isEditing = Boolean(
        target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
      )
      const isInDialog = Boolean(target?.closest('[role="dialog"], [role="alertdialog"]'))

      if (
        canEdit
        && (e.key === 'Delete' || e.key === 'Backspace')
        && !isEditing
        && !isInDialog
        && !deletionPending
      ) {
        if (selectedNodeId) {
          e.preventDefault()
          requestNodeDeletion(selectedNodeId)
        }
      }

      // The canvas has no text to select, so Cmd/Ctrl+A should not trigger the
      // browser's native "select all", which highlights every node's text with
      // the global ::selection color and looks like every table got selected.
      if (
        (e.key === 'a' || e.key === 'A')
        && (e.metaKey || e.ctrlKey)
        && !isEditing
        && !isInDialog
      ) {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canEdit, deletionPending, requestNodeDeletion, selectedNodeId])
}
