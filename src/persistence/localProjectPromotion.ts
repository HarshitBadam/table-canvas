import {
  deleteProject as deleteProjectRemote,
  updateProject,
  type ProjectPayload,
} from '@/api/projects.api'
import {
  deleteProject as deleteProjectLocal,
  listProjects as listProjectsLocal,
  loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
} from './db'
import { deserializePatches } from './patchSerialization'
import { createRemoteProject } from './projectCreateReconciliation'
import { promoteLocalFileRefs } from './projectFilePromotion'
import { isNetworkOnline } from './syncState'

export async function syncLocalProjectsToBackend(): Promise<void> {
  if (!isNetworkOnline()) return
  for (const summary of await listProjectsLocal()) {
    if (!summary.id.startsWith('local_')) continue
    const project = await loadProjectLocal(summary.id)
    if (!project) continue
    let createdProjectId: string | undefined
    let promotionCommitted = false
    try {
      const created = await createRemoteProject(
        { name: project.name },
        `promote:${summary.id}`,
      )
      createdProjectId = created.id
      const nodes = await promoteLocalFileRefs(created.id, project.nodes)
      await saveProjectLocal(
        created.id,
        project.name,
        nodes,
        project.edges,
        deserializePatches(project.patches),
      )
      await deleteProjectLocal(summary.id)
      promotionCommitted = true
      const payload: ProjectPayload = {
        name: project.name,
        nodes,
        edges: project.edges,
        patches: project.patches,
      }
      await updateProject(created.id, payload)
    } catch (error) {
      console.error('[syncService] Failed to sync local project to backend:', error)
      if (createdProjectId && !promotionCommitted) {
        try {
          await deleteProjectRemote(createdProjectId)
        } catch (cleanupError) {
          console.error('[syncService] Failed to clean up partial remote project:', cleanupError)
        }
      }
    }
  }
}
