import { getStorageScope } from '@/persistence/storageScope'
import { documentTabId } from '@/state/documentIdentity'

/**
 * Account-level project list coordination. Document leases only cover one open
 * project; create, rename, and delete must still reach every tab in the scope.
 */
export type ProjectCatalogEvent =
  | { type: 'catalog-changed'; tabId: string }
  | { type: 'project-deleted'; tabId: string; projectId: string }

type CatalogListener = (event: ProjectCatalogEvent) => void

interface CatalogSession {
  scope: string
  channel: BroadcastChannel | null
}

let session: CatalogSession | null = null
const listeners = new Set<CatalogListener>()

function channelName(scope: string): string {
  return `table-canvas:catalog:${scope}`
}

function ensureSession(scope = getStorageScope()): CatalogSession {
  if (session?.scope === scope) return session
  session?.channel?.close()
  const next: CatalogSession = { scope, channel: null }
  if (typeof BroadcastChannel !== 'undefined') {
    next.channel = new BroadcastChannel(channelName(scope))
    next.channel.onmessage = (event: MessageEvent<ProjectCatalogEvent>) => {
      if (!event.data || event.data.tabId === documentTabId()) return
      for (const listener of listeners) listener(event.data)
    }
  }
  session = next
  return next
}

export function publishCatalogChanged(scope = getStorageScope()): void {
  const active = ensureSession(scope)
  active.channel?.postMessage({
    type: 'catalog-changed',
    tabId: documentTabId(),
  } satisfies ProjectCatalogEvent)
}

export function publishProjectDeleted(
  projectId: string,
  scope = getStorageScope(),
): void {
  const active = ensureSession(scope)
  active.channel?.postMessage({
    type: 'project-deleted',
    tabId: documentTabId(),
    projectId,
  } satisfies ProjectCatalogEvent)
}

/** Keeps the catalog channel bound to the active storage scope. */
export function bindProjectCatalog(scope: string): () => void {
  ensureSession(scope)
  return () => {
    if (session?.scope !== scope) return
    session.channel?.close()
    session = null
  }
}

export function subscribeProjectCatalog(listener: CatalogListener): () => void {
  ensureSession()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
