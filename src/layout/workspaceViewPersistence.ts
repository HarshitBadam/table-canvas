import { isViewMode, type ViewMode } from './viewNavigation'

const STORAGE_KEY_PREFIX = 'table-canvas:workspace-view'
const KEY_SEPARATOR = '\u001f'

/**
 * The node kinds each node-scoped view can actually render. A stored view is
 * only restored when the node it points at still exists and is still of a kind
 * that view can open — a chart id left in a `grid` entry has to be treated as
 * stale rather than opened into an empty table.
 */
const VIEW_NODE_KINDS: Record<string, readonly string[]> = {
  grid: ['source_table', 'derived_table'],
  chart: ['chart'],
}

export interface WorkspaceViewSelection {
  view: ViewMode
  /** The node `grid` and `chart` are pointed at; null for every other view. */
  nodeId: string | null
}

/**
 * Views are remembered per document, and a document is a project within a
 * storage scope: the same project id under `guest` and under an account is two
 * different documents, so they must not share a remembered view.
 */
export function workspaceViewStorageKey(scope: string, projectId: string): string {
  return `${STORAGE_KEY_PREFIX}:${scope}${KEY_SEPARATOR}${projectId}`
}

export function isNodeScopedView(view: ViewMode): boolean {
  return view in VIEW_NODE_KINDS
}

/**
 * Reduces a stored selection to one that can actually be rendered now. Nodes are
 * deleted, renamed into other kinds, and arrive from other tabs, so what was
 * true when the view was stored is not guaranteed on the way back in. Anything
 * that no longer holds falls back to the canvas, which always renders.
 */
export function resolveWorkspaceView(
  selection: WorkspaceViewSelection,
  nodeKindOf: (nodeId: string) => string | undefined,
): WorkspaceViewSelection {
  if (!isNodeScopedView(selection.view)) return { view: selection.view, nodeId: null }
  if (!selection.nodeId) return { view: 'canvas', nodeId: null }

  const kind = nodeKindOf(selection.nodeId)
  if (kind && VIEW_NODE_KINDS[selection.view].includes(kind)) return selection
  return { view: 'canvas', nodeId: null }
}

/**
 * Storage is absent in some hosts, throws in others (Safari's private mode
 * rejects writes), and is present but hollow in a few — a `localStorage` object
 * with no methods on it. Reading the property can itself throw, so the whole
 * lookup is guarded and the methods are confirmed before use. A remembered view
 * is never worth failing a render over.
 */
function workspaceViewStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage
    if (typeof storage?.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return null
    }
    return storage
  } catch {
    return null
  }
}

/** Returns null for anything that is missing, unreadable, or not a view. */
export function readWorkspaceView(
  scope: string,
  projectId: string,
): WorkspaceViewSelection | null {
  const storage = workspaceViewStorage()
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(workspaceViewStorageKey(scope, projectId))
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { view, nodeId } = parsed as { view?: unknown; nodeId?: unknown }
    if (!isViewMode(view)) return null
    return { view, nodeId: typeof nodeId === 'string' && nodeId ? nodeId : null }
  } catch {
    return null
  }
}

export function writeWorkspaceView(
  scope: string,
  projectId: string,
  selection: WorkspaceViewSelection,
): void {
  const storage = workspaceViewStorage()
  if (!storage) return

  const nodeId = isNodeScopedView(selection.view) ? selection.nodeId : null
  try {
    storage.setItem(
      workspaceViewStorageKey(scope, projectId),
      JSON.stringify({ view: selection.view, nodeId }),
    )
  } catch {
    // A full or read-only storage costs the memory of the last view, nothing more.
  }
}

/**
 * An explicit sign-out starts a fresh workspace next time. Normal reloads and
 * browser restarts deliberately retain this state.
 */
export function clearWorkspaceViews(scope: string): void {
  const storage = workspaceViewStorage()
  if (
    !storage
    || typeof storage.removeItem !== 'function'
    || typeof storage.key !== 'function'
    || typeof storage.length !== 'number'
  ) return

  const prefix = `${STORAGE_KEY_PREFIX}:${scope}${KEY_SEPARATOR}`
  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach(key => storage.removeItem(key))
  } catch {
    // Clearing a remembered view must never make signing out fail.
  }
}
