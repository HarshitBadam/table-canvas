import type { ProjectNode } from '@/types'
import {
  deleteFile,
  listProjects,
  loadProject,
} from './db'
import { getStorageScope } from './storageScope'

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
): Promise<void> {
  const candidates = fileReferences(deletedNodes)
  if (candidates.size === 0) return

  const retained = new Set<string>()
  for (const summary of await listProjects(scope)) {
    const project = await loadProject(summary.id, scope)
    if (!project) continue
    for (const reference of fileReferences(project.nodes)) retained.add(reference)
  }

  await Promise.all(
    [...candidates]
      .filter(reference => !retained.has(reference))
             .map(reference => deleteFile(reference, scope)),
  )
}
