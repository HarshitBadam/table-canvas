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
  isGuestStorageScope,
} from './storageScope'
import { reportProjectSyncError } from './projectSaveSync'

export interface ProjectPromotion {
  sourceProjectId: string
  destinationProjectId: string
  sourceScope: string
}

/** Promotes an offline `local_` project already inside an account scope. */
export async function promoteLocalProject(
  projectId: string,
  scope: string,
): Promise<ProjectPromotion | null> {
  const project = await loadProjectLocal(projectId, scope)
  if (!project) return null
  const reports = await loadReportsForProject(projectId, scope)
  const created = await createProject(
    { name: project.name },
    `promote:${scope}:${projectId}`,
  )
  const nodes = await promoteLocalFileRefs(
    created.id,
    project.nodes,
    scope,
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
    scope,
  )
  await copyReportsToProject(
    projectId,
    created.id,
    scope,
    scope,
  )
  await deleteProjectLocal(projectId, scope)
  await deleteReportsForProject(projectId, scope)
  return {
    sourceProjectId: projectId,
    destinationProjectId: created.id,
    sourceScope: scope,
  }
}

export async function syncOfflineAccountProjects(): Promise<ProjectPromotion[]> {
  const promoted: ProjectPromotion[] = []
  if (!isNetworkOnline()) return promoted
  const destinationScope = getStorageScope()
  if (isGuestStorageScope(destinationScope)) return promoted

  for (const summary of await listProjectsLocal(destinationScope)) {
    if (!summary.id.startsWith('local_')) continue
    try {
      const result = await promoteLocalProject(
        summary.id,
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
  return promoted
}
