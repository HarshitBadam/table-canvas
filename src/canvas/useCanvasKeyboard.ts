import { useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useNodeDeletion } from '@/components/nodeDeletionContext'

export function useCanvasKeyboard() {
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const { requestNodeDeletion, deletionPending } = useNodeDeletion()

  useEffect(() => {
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

      if (
        (e.metaKey || e.ctrlKey)
        && e.key === 'z'
        && !e.shiftKey
        && !isEditing
        && !isInDialog
      ) {
        e.preventDefault()
        undo()
      }
      if (
        (e.metaKey || e.ctrlKey)
        && (e.key === 'y' || (e.key === 'z' && e.shiftKey))
        && !isEditing
        && !isInDialog
      ) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deletionPending, redo, requestNodeDeletion, selectedNodeId, undo])
}
