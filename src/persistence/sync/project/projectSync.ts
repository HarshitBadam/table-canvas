import { getProject, listProjects, type ProjectSummary } from '@/api/projects.api'
import { ApiError } from '@/api/client'
import {
  listProjects as listProjectsLocal, loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
} from '../../storage/local-db/db'
import { isNetworkOnline } from '../session/syncState'
import { createRemoteProject, isRetryableRemoteDeferral } from './projectCreateReconciliation'
import {
  createLocalProjectId,
  createProjectIntentKey,
  fromRemote,
  toTimestamp,
  type ProjectWithSync,
} from './projectSyncHelpers'
import { loadProjectWithSync } from './projectLoadSync'
import { deleteUnreferencedLocalFiles } from '../files/fileGarbageCollection'
import {
  flushAllQueuedProjectSavesWithSync,
  flushProjectSaveWithSync,
  reportProjectSyncError,
  type ProjectSyncConflict,
} from './save/projectSaveSync'
import {
  captureStorageScopeContext,
  isGuestStorageScope,
  isStorageScopeContextCurrent,
} from '../../storage/storageScope'
import {
  cancelQueuedProjectDelete,
  clearProjectSyncOperation,
  deleteProjectSnapshot,
  enqueueProjectDelete,
  listProjectSyncOperations,
} from './save/projectSyncQueue'
import {
  captureProjectSyncBase,
  dropProjectSyncBase,
  remoteProjectSnapshot,
} from './save/projectSyncBase'
import { publishCatalogChanged, publishProjectDeleted } from './projectCatalog'
export { isRetryableRemoteDeferral } from './projectCreateReconciliation'
export { syncOfflineAccountProjects } from '../session/localProjectPromotion'
export { importProjectWithSync } from './projectImportSync'
export { loadProjectWithSync } from './projectLoadSync'
export {
  flushProjectSaveWithSync, saveProjectWithSync, setProjectSyncErrorHandler,
} from './save/projectSaveSync'
export { setProjectMergeHandler } from '../session/syncNotifications'
export type { ProjectMergeEvent } from '../session/syncNotifications'
export type { ProjectWithSync } from './projectSyncHelpers'
export async function fetchProjects(): Promise<ProjectSummary[]> {
  const context = captureStorageScopeContext()
  const scope = context.scope
  if (isNetworkOnline() && !isGuestStorageScope(scope)) {
    try {
      const [remoteProjects, localProjects, operations] = await Promise.all([
        listProjects(),
        listProjectsLocal(scope),
        listProjectSyncOperations(scope),
      ])
      if (!isStorageScopeContextCurrent(context)) return []
      const localById = new Map(localProjects.map(project => [project.id, project]))
      const operationById = new Map(operations.map(operation => [
        operation.projectId,
        operation,
      ]))
      const merged = remoteProjects.flatMap((remote) => {
        const operation = operationById.get(remote.id)
        if (operation?.operation === 'delete') return []
        const local = localById.get(remote.id)
        if (!local || operation?.operation !== 'save') return [remote]
        return [{
          ...remote,
          name: local.name,
          updatedAt: new Date(local.updatedAt),
        }]
      })
      for (const local of localProjects) {
        const operation = operationById.get(local.id)
        if (
          !local.id.startsWith('local_')
          && operation?.operation !== 'save'
        ) continue
        if (operation?.operation === 'delete') continue
        if (merged.some(project => project.id === local.id)) continue
        merged.push({
          id: local.id,
          name: local.name,
          updatedAt: new Date(local.updatedAt),
          createdAt: new Date(local.updatedAt),
        })
      }
      return merged.sort(
        (a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt),
      )
    } catch (error) {
      console.error('[syncService] Failed to fetch projects from backend:', error)
      if (!isStorageScopeContextCurrent(context)) return []
      if (!isRetryableRemoteDeferral(error)) throw error
    }
  }
  const localProjects = await listProjectsLocal(scope)
  if (!isStorageScopeContextCurrent(context)) return []
  return localProjects.map(project => ({
    id: project.id,
    name: project.name,
    updatedAt: new Date(project.updatedAt),
    createdAt: new Date(project.updatedAt),
  }))
}

export async function flushAllProjectSavesWithSync(): Promise<ProjectSyncConflict[]> {
  const context = captureStorageScopeContext()
  const scope = context.scope
  const conflicts = await flushAllQueuedProjectSavesWithSync(scope)
  if (!isStorageScopeContextCurrent(context)) return []
  for (const conflict of conflicts) {
    if (conflict.operation === 'delete') {
      await cancelQueuedProjectDelete(
        conflict.projectId,
        scope,
        conflict.generation,
        context,
      )
      reportProjectSyncError(
        'A project changed in the cloud and was not deleted. The newer version was kept.',
      )
    }
    await loadProjectWithSync(conflict.projectId)
  }
  return conflicts
}

export async function createProjectWithSync(name = 'Untitled Project'): Promise<ProjectWithSync> {
  const context = captureStorageScopeContext()
  const scope = context.scope
  if (isNetworkOnline() && !isGuestStorageScope(scope)) {
    const remoteProject = await createRemoteProject(
      { name },
      createProjectIntentKey(scope, name),
      context,
    )
    if (!isStorageScopeContextCurrent(context)) throw new Error('The account changed while the project was being created.')
    const project = fromRemote(remoteProject)
    await saveProjectLocal(
      project.id,
      project.name,
      project.nodes,
      project.edges,
      project.patches,
      {
        createdAt: remoteProject.createdAt,
        updatedAt: remoteProject.updatedAt,
        revision: remoteProject.revision,
      },
      scope,
    )
    if (!isStorageScopeContextCurrent(context)) throw new Error('The account changed while the project was being created.')
    await captureProjectSyncBase(
      project.id,
      remoteProject.revision ?? 0,
      remoteProjectSnapshot(remoteProject),
      scope,
      context,
    )
    if (!isStorageScopeContextCurrent(context)) throw new Error('The account changed while the project was being created.')
    return project
  }
  const project: ProjectWithSync = {
    id: createLocalProjectId(),
    name,
    nodes: {},
    edges: {},
    patches: {},
    reports: {},
    isLocalOnly: true,
    needsSync: true,
    revision: 0,
  }
  await saveProjectLocal(
    project.id,
    project.name,
    project.nodes,
    project.edges,
    project.patches,
    undefined,
    scope,
  )
  if (!isStorageScopeContextCurrent(context)) throw new Error('The account changed while the project was being created.')
  return project
}

export async function deleteProjectWithSync(projectId: string): Promise<void> {
  const context = captureStorageScopeContext()
  const scope = context.scope
  const localProject = await loadProjectLocal(projectId, scope)
  if (!isStorageScopeContextCurrent(context)) return
  if (projectId.startsWith('local_') || isGuestStorageScope(scope)) {
    const deletedNodes = await deleteProjectSnapshot(projectId, scope, context)
    if (!isStorageScopeContextCurrent(context)) return
    await clearProjectSyncOperation(projectId, scope, undefined, context)
    if (!isStorageScopeContextCurrent(context)) return
    publishProjectDeleted(projectId, scope)
    if (!deletedNodes) return
    await dropProjectSyncBase(projectId, scope)
    await deleteUnreferencedLocalFiles(deletedNodes, scope, context)
    return
  }

  let expectedRevision = localProject?.revision ?? 0
  if (isNetworkOnline()) {
    try {
      const remoteProject = await getProject(projectId)
      if (!isStorageScopeContextCurrent(context)) return
      expectedRevision = remoteProject.revision
    } catch (error) {
      const alreadyDeleted = error instanceof ApiError && error.statusCode === 404
      if (!alreadyDeleted && !isRetryableRemoteDeferral(error)) throw error
    }
  }

  if (!isStorageScopeContextCurrent(context)) return
  const queuedDelete = await enqueueProjectDelete(projectId, expectedRevision, scope)
  if (!isStorageScopeContextCurrent(context)) return
  if (isNetworkOnline()) {
    try {
      await flushProjectSaveWithSync(projectId, scope, context)
      return
    } catch (error) {
      if (!isRetryableRemoteDeferral(error)) {
        await cancelQueuedProjectDelete(
          projectId,
          scope,
          queuedDelete.generation,
          context,
        )
        publishCatalogChanged(scope)
        throw error
      }
    }
  }
  const deletedNodes = await deleteProjectSnapshot(projectId, scope, context)
  if (!isStorageScopeContextCurrent(context)) return
  await dropProjectSyncBase(projectId, scope)
  publishProjectDeleted(projectId, scope)
  if (deletedNodes) await deleteUnreferencedLocalFiles(deletedNodes, scope, context)
}