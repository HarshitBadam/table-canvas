import { useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useApp } from '@/state/AppContext'
import { getDependentNodeIds } from '@/engine/workflowGraph'

export function useCanvasKeyboard() {
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const { deleteNodeWithSync } = useApp()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null
      const isEditing = Boolean(
        target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
      )
      const isInDialog = Boolean(target?.closest('[role="dialog"]'))

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing && !isInDialog) {
        if (selectedNodeId) {
          e.preventDefault()
          const project = useProjectStore.getState()
          const node = project.nodes[selectedNodeId]
          const dependents = getDependentNodeIds(
            project.nodes,
            project.edges,
            selectedNodeId,
          )
          const dependentMessage = dependents.size > 0
            ? ` This will also delete ${dependents.size} dependent node${dependents.size === 1 ? '' : 's'}.`
            : ''
          if (window.confirm(`Delete "${node?.name ?? 'this node'}"?${dependentMessage}`)) {
            void deleteNodeWithSync(selectedNodeId)
          }
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
  }, [undo, redo, selectedNodeId, deleteNodeWithSync])
}
