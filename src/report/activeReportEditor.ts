import type { Editor } from '@tiptap/react'

/**
 * The report editor currently on screen, published for workspace-level keyboard
 * handling.
 *
 * Undo has to reach the report's own history from anywhere on the report view,
 * including the toolbar and the inside of an embedded table — places whose focus
 * is nowhere near the document, and which are free to stop keystrokes from
 * travelling through the DOM. A registry answers "which document is open" without
 * depending on where focus happens to be, and there is only ever one report
 * editor mounted, so a single slot is the whole model.
 */
let activeEditor: Editor | null = null

export function setActiveReportEditor(editor: Editor | null): void {
  activeEditor = editor
}

/** Null once the report view is gone, so a torn-down editor is never used. */
export function getActiveReportEditor(): Editor | null {
  if (!activeEditor || activeEditor.isDestroyed) return null
  return activeEditor
}
