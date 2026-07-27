import type { NodeUI, ProjectNode } from '@/types'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const canonical: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    canonical[key] = canonicalize(source[key])
  }
  return canonical
}

export function isDeepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

/** Locale-independent so both devices sort identically. */
export function compareStrings(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function unionKeys(...records: Array<Record<string, unknown>>): string[] {
  const keys = new Set<string>()
  for (const record of records) {
    for (const key of Object.keys(record)) keys.add(key)
  }
  return [...keys].sort(compareStrings)
}

export function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {}
  for (const key of Object.keys(record).sort(compareStrings)) sorted[key] = record[key]
  return sorted
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

/** Ties, and timestamps missing or unparseable on either side, resolve to the server. */
export function isLocalNewer(
  localUpdatedAt: string | undefined,
  serverUpdatedAt: string | undefined,
): boolean {
  const local = parseTimestamp(localUpdatedAt)
  const server = parseTimestamp(serverUpdatedAt)
  if (local === null || server === null) return false
  return local > server
}

function resolveNodeUi(
  base: ProjectNode | undefined,
  local: ProjectNode,
  server: ProjectNode,
): NodeUI {
  const localChanged = !isDeepEqual(local.ui, base?.ui)
  const serverChanged = !isDeepEqual(server.ui, base?.ui)
  return localChanged && !serverChanged ? local.ui : server.ui
}

function resolveConflictingNode(
  base: ProjectNode | undefined,
  local: ProjectNode,
  server: ProjectNode,
): ProjectNode {
  const winner = isLocalNewer(local.updatedAt, server.updatedAt) ? local : server
  return { ...winner, ui: resolveNodeUi(base, local, server) }
}

function resolveNode(
  base: ProjectNode | undefined,
  local: ProjectNode | undefined,
  server: ProjectNode | undefined,
): ProjectNode | null {
  if (!local && !server) return null
  if (!local) return isDeepEqual(server, base) ? null : server ?? null
  if (!server) return isDeepEqual(local, base) ? null : local
  if (isDeepEqual(local, base)) return server
  if (isDeepEqual(server, base)) return local
  return resolveConflictingNode(base, local, server)
}

export function mergeNodeMaps(
  base: Record<string, ProjectNode>,
  local: Record<string, ProjectNode>,
  server: Record<string, ProjectNode>,
): Record<string, ProjectNode> {
  const merged: Record<string, ProjectNode> = {}
  for (const nodeId of unionKeys(base, local, server)) {
    const resolved = resolveNode(base[nodeId], local[nodeId], server[nodeId])
    if (resolved) merged[nodeId] = resolved
  }
  return merged
}

/** Node ids whose local edit outranks the server edit, used to arbitrate patches. */
export function collectLocalWinningNodeIds(
  local: Record<string, ProjectNode>,
  server: Record<string, ProjectNode>,
): Set<string> {
  const nodeIds = new Set<string>()
  for (const [nodeId, localNode] of Object.entries(local)) {
    const serverNode = server[nodeId]
    if (!serverNode || isLocalNewer(localNode.updatedAt, serverNode.updatedAt)) {
      nodeIds.add(nodeId)
    }
  }
  return nodeIds
}
