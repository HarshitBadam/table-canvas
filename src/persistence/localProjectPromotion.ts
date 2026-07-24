import {
  updateProject,
  createProject,
  type ProjectPayload,
} from '@/api/projects.api'
import {
  deleteProject as deleteProjectLocal,
  listProjects as listProjectsLocal,
  loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
} from './db'
import { deserializePatches } from './patchSerialization'
import { promoteLocalFileRefs } from './projectFilePromotion'
import { isNetworkOnline } from './syncState'
import {
  copyReportsToProject,
  deleteReportsForProject,
} from './reportStorage'
import {
  getStorageScope,
  GUEST_STORAGE_SCOPE,
} from './storageScope'

export async function syncLocalProjectsToBackend(): Promise<void> {
  if (!isNetworkOnline()) return
  const destinationScope = getStorageScope()
  if (destinationScope === GUEST_STORAGE_SCOPE) return

  const sourceScopes = [GUEST_STORAGE_SCOPE, destinationScope]
  for (const sourceScope of sourceScopes) {
    for (const summary of await listProjectsLocal(sourceScope)) {
      if (!summary.id.startsWith('local_')) continue
      const project = await loadProjectLocal(summary.id, sourceScope)
      if (!project) continue
      try {
        const created = await createProject(
          { name: project.name },
          `promote:${sourceScope}:${summary.id}`,
        )
        const nodes = await promoteLocalFileRefs(
          created.id,
          project.nodes,
          sourceScope,
        )
        const payload: ProjectPayload = {
          name: project.name,
          nodes,
          edges: project.edges,
          patches: project.patches,
          expectedRevision: created.revision ?? 0,
        }
        const updated = await updateProject(created.id, payload)
        await saveProjectLocal(
          created.id,
          project.name,
          nodes,
          project.edges,
          deserializePatches(project.patches),
          { revision: updated.revision, updatedAt: updated.updatedAt },
        )
        await copyReportsToProject(
          summary.id,
          created.id,
          sourceScope,
          destinationScope,
        )
        await deleteProjectLocal(summary.id, sourceScope)
        await deleteReportsForProject(summary.id, sourceScope)
      } catch (error) {
        console.error('[syncService] Failed to sync local project to backend:', error)
      }
    }
  }
}
