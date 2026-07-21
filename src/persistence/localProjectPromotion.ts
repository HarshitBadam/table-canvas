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
  loadReportsForProject,
} from './reportStorage'
import {
  getStorageScope,
  GUEST_STORAGE_SCOPE,
} from './storageScope'
import { reportProjectSyncError } from './projectSaveSync'

export interface ProjectPromotion {
  sourceProjectId: string
  destinationProjectId: string
  sourceScope: string
}

export async function promoteLocalProject(
  projectId: string,
  sourceScope: string,
  destinationScope = getStorageScope(),
): Promise<ProjectPromotion | null> {
  const project = await loadProjectLocal(projectId, sourceScope)
  if (!project) return null
  const reports = await loadReportsForProject(projectId, sourceScope)
  const created = await createProject(
    { name: project.name },
    `promote:${sourceScope}:${projectId}`,
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
    reports: Object.fromEntries(
      Object.entries(reports).map(([id, report]) => [
        id,
        { ...report, projectId: created.id },
      ]),
    ),
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
    destinationScope,
  )
  await copyReportsToProject(
    projectId,
    created.id,
    sourceScope,
    destinationScope,
  )
  await deleteProjectLocal(projectId, sourceScope)
  await deleteReportsForProject(projectId, sourceScope)
  return {
    sourceProjectId: projectId,
    destinationProjectId: created.id,
    sourceScope,
  }
}

export async function syncLocalProjectsToBackend(): Promise<ProjectPromotion[]> {
  const promoted: ProjectPromotion[] = []
  if (!isNetworkOnline()) return promoted
  const destinationScope = getStorageScope()
  if (destinationScope === GUEST_STORAGE_SCOPE) return promoted

  const sourceScopes = [GUEST_STORAGE_SCOPE, destinationScope]
  for (const sourceScope of sourceScopes) {
    for (const summary of await listProjectsLocal(sourceScope)) {
      if (!summary.id.startsWith('local_')) continue
      try {
        const result = await promoteLocalProject(
          summary.id,
          sourceScope,
          destinationScope,
        )
        if (result) promoted.push(result)
      } catch (error) {
        console.error('[syncService] Failed to sync local project to backend:', error)
        reportProjectSyncError(
          error instanceof Error
            ? `Local project promotion failed: ${error.message}`
            : 'Local project promotion failed',
        )
      }
    }
  }
  return promoted
}
