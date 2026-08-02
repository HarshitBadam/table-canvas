import { useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useWorkspaceLease } from '@/state/useWorkspaceLease'
import { getActiveReportEditor } from '@/report/activeReportEditor'
import { historyIntentFor, historyTargetFor } from './historyShortcuts'
import type { ViewMode } from './viewNavigation'

const NATIVE_TEXT_FIELD = 'input, textarea, select'
const DIALOG = '[role="dialog"], [role="alertdialog"]'

/**
 * The workspace's single undo/redo keyboard handler.
 *
 * It lives here, mounted for the whole session, because undo is a workspace
 * shortcut rather than a feature of whichever view implemented it. Wiring it per
 * view meant it existed on the canvas, existed as buttons but not keys in the
 * grid, and existed on the report only while focus was inside the document —
 * so the same keystroke did different things, or nothing at all, depending on
 * what the user had last clicked.
 *
 * One rule holds throughout: a recognised undo or redo is always consumed. Even
 * when nothing can act on it, the keystroke stops here rather than reaching the
 * browser, which is free to treat it as a command of its own.
 */
export function useHistoryShortcuts(view: ViewMode): void {
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const { canEdit } = useWorkspaceLease()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const intent = historyIntentFor(event)
      if (!intent) return

      /*
       * The report document's own keymap runs while the event travels up from
       * the editor and marks it handled. Anything still unhandled by the time it
       * reaches the window is this handler's to decide, including the case where
       * the document declined it.
       */
      if (event.defaultPrevented) return

      const target = event.target instanceof Element ? event.target : null
      const destination = historyTargetFor({
        view,
        inNativeTextField: Boolean(target?.closest(NATIVE_TEXT_FIELD)),
        inDialog: Boolean(target?.closest(DIALOG)),
        canEdit,
      })

      if (destination === 'native') return

      event.preventDefault()
      if (destination === 'blocked') return

      if (destination === 'report') {
        const editor = getActiveReportEditor()
        if (intent === 'undo') editor?.commands.undo()
        else editor?.commands.redo()
        return
      }

      if (intent === 'undo') undo()
      else redo()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canEdit, redo, undo, view])
}
