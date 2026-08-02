import type { ProjectNode } from '@/types'

function isPendingImport(node: ProjectNode): boolean {
  return (
    node.kind === 'source_table'
    && typeof node.plan?.fileRef === 'string'
    && node.plan.fileRef.startsWith('pending:')
  )
}

export function hasPendingImportedTables(
  nodes: Record<string, ProjectNode>,
): boolean {
  return Object.values(nodes).some(isPendingImport)
}

/**
 * Per-tab compute state used to live on the node (`cacheInfo`) and now lives in
 * `tableRuntimeStore`. Documents written before that change still carry it, so strip it
 * on the way in and out: leaving it in place would make an untouched document look
 * changed to the cross-device merge.
 */
export function withoutRuntimeNodeState(
  nodes: Record<string, ProjectNode>,
): Record<string, ProjectNode> {
  return Object.fromEntries(Object.entries(nodes).flatMap(([id, node]) => {
    // Incomplete imports use a synthetic fileRef; never persist them.
    if (isPendingImport(node)) {
      return []
    }
    if (!('cacheInfo' in node)) return [[id, node]]
    const stripped = { ...node } as ProjectNode & { cacheInfo?: unknown }
    delete stripped.cacheInfo
    return [[id, stripped as ProjectNode]]
  }))
}

let documentWriteGuard: (() => boolean) | null = null

/** Installed by the write-lease hook; absent means this tab is the only writer. */
export function setDocumentWriteGuard(guard: (() => boolean) | null): void {
  documentWriteGuard = guard
}

export function canWriteDocument(): boolean {
  return documentWriteGuard?.() ?? true
}
