import { useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useApp } from '@/state/AppContext'

/**
 * Registers global keydown handlers for the canvas:
 *   - Delete / Backspace  → delete the selected node
 *   - Cmd/Ctrl + Z        → undo
 *   - Cmd/Ctrl + Y  or
 *     Cmd/Ctrl + Shift+Z  → redo
 *
 * Guards against firing while the user is typing in an input / textarea /
 * contenteditable element.
 */
export function useCanvasKeyboard() {
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const { deleteNodeWithSync } = useApp()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
        if (selectedNodeId) {
          e.preventDefault()
          deleteNodeWithSync(selectedNodeId)
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, selectedNodeId, deleteNodeWithSync])
}
