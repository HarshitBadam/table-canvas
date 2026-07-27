import { getStorageScope, scopedStorageKey } from '@/persistence/storageScope'

/**
 * A document is the tuple (storage scope, project id). It keys IndexedDB records,
 * the write lease, and the mirror channel, so a guest tab and a signed-in tab on the
 * same project id are different documents and never coordinate.
 */
export interface DocumentIdentity {
  scope: string
  projectId: string
  key: string
}

const PROJECT_PATH_PREFIX = '/p/'

export function documentKey(scope: string, projectId: string): string {
  return scopedStorageKey(scope, projectId)
}

export function activeDocumentIdentity(
  projectId: string | null | undefined,
): DocumentIdentity | null {
  if (!projectId) return null
  const scope = getStorageScope()
  return { scope, projectId, key: documentKey(scope, projectId) }
}

export function documentLeaseName(key: string): string {
  return `table-canvas:doc-lease:${key}`
}

export function documentMirrorChannel(key: string): string {
  return `table-canvas:doc-mirror:${key}`
}

/** Separate from the mirror channel: a tab must not hear its own mirror publishes. */
export function documentLeaseChannel(key: string): string {
  return `table-canvas:doc-lease:${key}`
}

export function documentProjectPath(projectId: string): string {
  return `${PROJECT_PATH_PREFIX}${encodeURIComponent(projectId)}`
}

export function documentProjectIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PROJECT_PATH_PREFIX)) return null
  const segment = pathname.slice(PROJECT_PATH_PREFIX.length).split('/')[0]
  if (!segment) return null
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

let cachedTabId = ''

/** Stable for the lifetime of the page; identifies this tab to peers. */
export function documentTabId(): string {
  if (!cachedTabId) {
    cachedTabId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  return cachedTabId
}
