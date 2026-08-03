import type { ProjectNode } from '@/types'
import { listProjects, loadProject } from '../../storage/local-db/db'
import { deleteFileWithSync } from './fileSync'
import {
  getStorageScope,
  isGuestStorageScope,
} from '../../storage/storageScope'
import { isNetworkOnline } from '../session/syncState'

const candidatesByScope = new Map<string, Set<string>>()
const retainedByScope = new Map<string, Set<string>>()

export function fileRefsInNodes(nodes: Record<string, ProjectNode>): Set<string> {
  const refs = new Set<string>()
  for (const node of Object.values(nodes)) {
    if (node.kind === 'source_table' && node.plan.fileRef) refs.add(node.plan.fileRef)
  }
  return refs
}

export function retainHistoryFileRefs(scope: string, refs: Iterable<string>): void {
  retainedByScope.set(scope, new Set(refs))
}

export function queueHistoryFileCleanup(scope: string, refs: Iterable<string>): void {
  const candidates = candidatesByScope.get(scope) ?? new Set<string>()
  for (const ref of refs) {
    if (ref) candidates.add(ref)
  }
  candidatesByScope.set(scope, candidates)
}

export async function flushHistoryFileCleanup(
  liveNodes: Record<string, ProjectNode>,
  scope: string,
): Promise<void> {
  if (scope !== getStorageScope()) return
  const candidates = candidatesByScope.get(scope)
  if (!candidates?.size) return
  if (!isGuestStorageScope(scope) && !isNetworkOnline()) return

  const retained = new Set([
    ...fileRefsInNodes(liveNodes),
    ...(retainedByScope.get(scope) ?? []),
  ])
  for (const fileId of [...candidates]) {
    if (retained.has(fileId)) continue
    if (
      isGuestStorageScope(scope)
      && await isReferencedByLocalProject(fileId, scope)
    ) {
      candidates.delete(fileId)
      continue
    }
    try {
      await deleteFileWithSync(
        fileId,
        isGuestStorageScope(scope) ? undefined : { strictRemote: true },
      )
      candidates.delete(fileId)
    } catch (error) {
      console.warn('[history] Deferred unreferenced file cleanup:', error)
    }
  }
  if (candidates.size === 0) candidatesByScope.delete(scope)
}

async function isReferencedByLocalProject(
  fileId: string,
  scope: string,
): Promise<boolean> {
  for (const summary of await listProjects(scope)) {
    const project = await loadProject(summary.id, scope)
    if (project && fileRefsInNodes(project.nodes).has(fileId)) return true
  }
  return false
}
