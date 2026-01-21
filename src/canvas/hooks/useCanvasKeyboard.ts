/**
 * useCanvasKeyboard Hook
 * 
 * Handles keyboard shortcuts for the canvas:
 * - Delete/Backspace: Delete selected node
 * - Cmd/Ctrl + Z: Undo
 * - Cmd/Ctrl + Shift + Z / Cmd/Ctrl + Y: Redo
 */

import { useEffect } from 'react'

interface UseCanvasKeyboardOptions {
  /** Currently selected node ID */
  selectedNodeId: string | null
  /** Undo function */
  undo: () => void
  /** Redo function */
  redo: () => void
  /** Delete node function */
  onDeleteNode: (nodeId: string) => void
}

/**
 * Hook for canvas keyboard shortcuts.
 */
export function useCanvasKeyboard({
  selectedNodeId,
  undo,
  redo,
  onDeleteNode,
}: UseCanvasKeyboardOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable

      // Delete/Backspace: Delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
        if (selectedNodeId) {
          e.preventDefault()
          onDeleteNode(selectedNodeId)
        }
      }

      // Undo: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }

      // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, selectedNodeId, onDeleteNode])
}
