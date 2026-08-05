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
} from '../../storage/local-db/db'
import { deserializePatches } from '../../storage/local-db/patchSerialization'
import { promoteLocalFileRefs } from '../files/projectFilePromotion'
import { isNetworkOnline } from './syncState'
import {
  copyReportsToProject,
  deleteReportsForProject,
  loadReportsForProject,
} from '../../storage/local-db/reportStorage'
import {
  captureStorageScopeContext,
  isGuestStorageScope,
  isStorageScopeContextCurrent,
  type StorageScopeContext,
} from '../../storage/storageScope'
import { reportProjectSyncError } from '../project/save/projectSaveSync'

export interface ProjectPromotion {
  sourceProjectId: string
  destinationProjectId: string
  sourceScope: string
}

export async function promoteLocalProject(
  projectId: string,
  scope: string,
  context = captureStorageScopeContext(),
): Promise<ProjectPromotion | null> {
  assertPromotionContext(scope, context)
  const project = await loadProjectLocal(projectId, scope)
  assertPromotionContext(scope, context)
  if (!project) return null
  const reports = await loadReportsForProject(projectId, scope)
  assertPromotionContext(scope, context)
  const created = await createProject(
    { name: project.name },
    `promote:${scope}:${projectId}`,
  )
  assertPromotionContext(scope, context)
  const nodes = await promoteLocalFileRefs(
    created.id,
    project.nodes,
    scope,
    context,
  )
  assertPromotionContext(scope, context)
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
  assertPromotionContext(scope, context)
  await saveProjectLocal(
    created.id,
    project.name,
    nodes,
    project.edges,
    deserializePatches(project.patches),
    { revision: updated.revision, updatedAt: updated.updatedAt },
    scope,
  )
  assertPromotionContext(scope, context)
  await copyReportsToProject(
    projectId,
    created.id,
    scope,
    scope,
  )
  assertPromotionContext(scope, context)
  await deleteProjectLocal(projectId, scope)
  assertPromotionContext(scope, context)
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
  const context = captureStorageScopeContext()
  const destinationScope = context.scope
  if (isGuestStorageScope(destinationScope)) return promoted

  for (const summary of await listProjectsLocal(destinationScope)) {
    if (!isStorageScopeContextCurrent(context)) break
    if (!summary.id.startsWith('local_')) continue
    try {
      const result = await promoteLocalProject(
        summary.id,
        destinationScope,
        context,
      )
      if (result) promoted.push(result)
    } catch (error) {
      if (!isStorageScopeContextCurrent(context)) break
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

function assertPromotionContext(scope: string, context: StorageScopeContext): void {
  if (scope !== context.scope || !isStorageScopeContextCurrent(context)) {
    throw new Error('The account changed while the local project was being synchronized.')
  }
}
