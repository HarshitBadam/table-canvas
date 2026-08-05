import type { ProjectNode } from '@/types'
import {
  deleteFile,
  listProjects,
  loadProject,
} from '../../storage/local-db/db'
import {
  captureStorageScopeContext,
  getStorageScope,
  isStorageScopeContextCurrent,
  type StorageScopeContext,
} from '../../storage/storageScope'

function fileReferences(nodes: Record<string, ProjectNode>): Set<string> {
  const references = new Set<string>()
  for (const node of Object.values(nodes)) {
    if (node.kind === 'source_table' && node.plan.fileRef) {
      references.add(node.plan.fileRef)
    }
  }
  return references
}

export async function deleteUnreferencedLocalFiles(
  deletedNodes: Record<string, ProjectNode>,
  scope = getStorageScope(),
  context: StorageScopeContext = captureStorageScopeContext(),
): Promise<void> {
  if (scope !== context.scope || !isStorageScopeContextCurrent(context)) return
  const candidates = fileReferences(deletedNodes)
  if (candidates.size === 0) return

  const retained = new Set<string>()
  for (const summary of await listProjects(scope)) {
    if (!isStorageScopeContextCurrent(context)) return
    const project = await loadProject(summary.id, scope)
    if (!isStorageScopeContextCurrent(context)) return
    if (!project) continue
    for (const reference of fileReferences(project.nodes)) retained.add(reference)
  }

  for (const reference of candidates) {
    if (retained.has(reference)) continue
    if (!isStorageScopeContextCurrent(context)) return
    await deleteFile(reference, scope)
  }
}
