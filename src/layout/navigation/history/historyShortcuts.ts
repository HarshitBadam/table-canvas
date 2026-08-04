import type { ViewMode } from '../viewNavigation'

export type HistoryIntent = 'undo' | 'redo'

export interface HistoryKeyStroke {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * `event.key` reports the character the modifiers produce, so Shift turns `z`
 * into `Z`. Matching the raw value is why redo only ever worked through Ctrl+Y:
 * `key === 'z' && shiftKey` describes a keystroke the browser never sends.
 *
 * Alt is excluded rather than ignored. Ctrl+Alt combinations are how several
 * keyboard layouts type ordinary characters, and claiming them would take a
 * letter away from the person typing it.
 */
export function historyIntentFor(stroke: HistoryKeyStroke): HistoryIntent | null {
  if (!(stroke.metaKey || stroke.ctrlKey) || stroke.altKey) return null

  const key = stroke.key.toLowerCase()
  if (key === 'z') return stroke.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !stroke.shiftKey) return 'redo'
  return null
}

/**
 * Which history owns the keystroke.
 *
 * - `native`: leave it to the focused form field; the browser applies it.
 * - `blocked`: consume without acting (modal open, or this tab cannot edit).
 * - `report` / `project`: route there; report never falls through to project.
 */
export type HistoryTarget = 'native' | 'report' | 'project' | 'blocked'

export interface HistoryContext {
  view: ViewMode
  /** Focus is in a real form field, which keeps its own undo stack. */
  inNativeTextField: boolean
  /** A modal is open, so the workspace behind it is not what is being edited. */
  inDialog: boolean
  /** False while another tab holds the write lease. */
  canEdit: boolean
}

/**
 * Exactly one history responds to a given keystroke, decided by where the user
 * is rather than by which handler happens to be mounted. That is the difference
 * that matters: undo used to be wired per view, so it silently did nothing on
 * the views that had no handler and on the blocks that swallowed the key.
 *
 * A report never falls through to the project's history. Undo in a document
 * whose own history is exhausted has to stop there, not reach past the document
 * and start reversing edits the user cannot see.
 */
export function historyTargetFor(context: HistoryContext): HistoryTarget {
  if (context.inNativeTextField) return 'native'
  if (context.inDialog || !context.canEdit) return 'blocked'
  return context.view === 'report' ? 'report' : 'project'
}
