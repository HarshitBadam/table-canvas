import {
  getProject, listProjects, type ProjectSummary,
} from '@/api/projects.api'
import { ApiError } from '@/api/client'
import type { Edge, Patches, ProjectNode } from '@/types'
import {
  listProjects as listProjectsLocal, loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
} from '../../storage/local-db/db'
import { deserializePatches } from '../../storage/local-db/patchSerialization'
import { isNetworkOnline } from '../session/syncState'
import { withoutRuntimeNodeState } from '@/state/document/transientProjectState'
import {
  createRemoteProject, isRetryableRemoteDeferral,
} from './projectCreateReconciliation'
import { deleteUnreferencedLocalFiles } from '../files/fileGarbageCollection'
import {
  flushAllQueuedProjectSavesWithSync,
  flushProjectSaveWithSync,
  reportProjectSyncError,
  type ProjectSyncConflict,
} from './save/projectSaveSync'
import {
  getStorageScope,
  isCloudStorageScope,
} from '../../storage/storageScope'
import type { Report } from '@/report/types'
import { replaceReportsForProject } from '../../storage/local-db/reportStorage'
import {
  cancelQueuedProjectDelete,
  clearProjectSyncOperation,
  deleteProjectSnapshot,
  enqueueProjectDelete,
  getProjectSyncOperation,
  listProjectSyncOperations,
} from './save/projectSyncQueue'
import {
  captureProjectSyncBase,
  dropProjectSyncBase,
  remoteProjectSnapshot,
} from './save/projectSyncBase'
import {
  publishCatalogChanged,
  publishProjectDeleted,
} from './projectCatalog'
export {
  isRetryableRemoteDeferral,
} from './projectCreateReconciliation'
export { syncOfflineAccountProjects } from '../session/localProjectPromotion'
export { importProjectWithSync } from './projectImportSync'
export {
  flushProjectSaveWithSync, saveProjectWithSync,
  setProjectSyncErrorHandler,
} from './save/projectSaveSync'
export { setProjectMergeHandler } from '../session/syncNotifications'
export type { ProjectMergeEvent } from '../session/syncNotifications'

export interface ProjectWithSync {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  isLocalOnly?: boolean
  needsSync?: boolean
  revision?: number
  reports?: Record<string, Report>
}

function fromRemote(project: Awaited<ReturnType<typeof getProject>>): ProjectWithSync {
  const revision = project.revision ?? 0
  return {
    id: project.id,
    name: project.name,
    nodes: withoutRuntimeNodeState(project.nodes),
    edges: project.edges,
    patches: deserializePatches(project.patches),
    isLocalOnly: false,
    needsSync: false,
    revision,
    reports: project.reports ?? {},
  }
}

function toTimestamp(value: Date | string | undefined): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  if (isNetworkOnline() && isCloudStorageScope()) {
    try {
      const [remoteProjects, localProjects, operations] = await Promise.all([
        listProjects(),
        listProjectsLocal(),
        listProjectSyncOperations(),
      ])
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
      if (!isRetryableRemoteDeferral(error)) throw error
    }
  }
  return (await listProjectsLocal()).map(project => ({
    id: project.id,
    name: project.name,
    updatedAt: new Date(project.updatedAt),
    createdAt: new Date(project.updatedAt),
  }))
}

export async function flushAllProjectSavesWithSync(): Promise<ProjectSyncConflict[]> {
  const scope = getStorageScope()
  const conflicts = await flushAllQueuedProjectSavesWithSync(scope)
  for (const conflict of conflicts) {
    if (conflict.operation === 'delete') {
      await cancelQueuedProjectDelete(conflict.projectId, scope)
      reportProjectSyncError(
        'A project changed in the cloud and was not deleted. The newer version was kept.',
      )
    }
    await loadProjectWithSync(conflict.projectId)
  }
  return conflicts
}

export async function loadProjectWithSync(projectId: string): Promise<ProjectWithSync | null> {
  const scope = getStorageScope()
  const localProject = await loadProjectLocal(projectId)
  const pending = await getProjectSyncOperation(projectId, scope)
  if (pending?.operation === 'delete') {
    if (isNetworkOnline() && isCloudStorageScope()) {
      try {
        await flushProjectSaveWithSync(projectId, scope)
        return null
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 409) {
          await cancelQueuedProjectDelete(projectId, scope)
          publishCatalogChanged(scope)
          reportProjectSyncError(
            'This project changed in the cloud and was not deleted. The newer version was kept.',
          )
        } else if (isRetryableRemoteDeferral(error)) {
          return null
        } else {
          throw error
        }
      }
    } else {
      return null
    }
  }
  if (projectId.startsWith('local_')) {
    if (!localProject) return null
    return {
      ...localProject,
      patches: deserializePatches(localProject.patches),
      isLocalOnly: true,
      needsSync: true,
      revision: localProject.revision ?? 0,
    }
  }

  if (isNetworkOnline() && isCloudStorageScope()) {
    try {
      let remoteProject = await getProject(projectId)
      if (pending?.operation === 'save' && localProject) {
        try {
          await flushProjectSaveWithSync(projectId, scope)
          const synced = await loadProjectLocal(projectId, scope)
          if (synced) {
            return {
              ...synced,
              patches: deserializePatches(synced.patches),
              isLocalOnly: false,
              needsSync: false,
              revision: synced.revision ?? remoteProject.revision ?? 0,
            }
          }
        } catch (error) {
          if (error instanceof ApiError && error.statusCode === 409) {
            // The flush already merged or preserved the queued work; take the cloud copy.
            remoteProject = await getProject(projectId)
          } else if (isRetryableRemoteDeferral(error)) {
            return {
              ...localProject,
              patches: deserializePatches(localProject.patches),
              isLocalOnly: false,
              needsSync: true,
              revision: localProject.revision ?? 0,
            }
          } else {
            throw error
          }
        }
      }

      const loaded = fromRemote(remoteProject)
      await saveProjectLocal(
        loaded.id,
        loaded.name,
        loaded.nodes,
        loaded.edges,
        loaded.patches,
        {
          createdAt: remoteProject.createdAt,
          updatedAt: remoteProject.updatedAt,
          revision: remoteProject.revision,
        },
      )
      await replaceReportsForProject(
        loaded.id,
        remoteProject.reports ?? {},
      )
      await captureProjectSyncBase(
        loaded.id,
        remoteProject.revision ?? 0,
        remoteProjectSnapshot(remoteProject),
        scope,
      )
      return loaded
    } catch (error) {
      console.error('[syncService] Failed to load project from backend:', error)
      // Invalid/missing remote ids should fall back to the local cache instead of
      // hard-failing boot when IndexedDB still has a usable copy.
      const missingOrInvalidRemote = error instanceof ApiError
        && (error.statusCode === 400 || error.statusCode === 404)
      if (!missingOrInvalidRemote && !isRetryableRemoteDeferral(error)) {
        throw error
      }
    }
  }
  if (!localProject) return null
  const fallback = {
    ...localProject,
    patches: deserializePatches(localProject.patches),
    isLocalOnly: !isNetworkOnline() || !isCloudStorageScope(),
    needsSync: pending?.operation === 'save',
    revision: localProject.revision ?? 0,
  }
  return fallback
}

export async function createProjectWithSync(name = 'Untitled Project'): Promise<ProjectWithSync> {
  if (isNetworkOnline() && isCloudStorageScope()) {
    const remoteProject = await createRemoteProject({ name }, `create:${name}`)
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
    )
    await captureProjectSyncBase(
      project.id,
      remoteProject.revision ?? 0,
      remoteProjectSnapshot(remoteProject),
    )
    return project
  }
  const project: ProjectWithSync = {
    id: createLocalId('local'),
    name,
    nodes: {},
    edges: {},
    patches: {},
    reports: {},
    isLocalOnly: true,
    needsSync: true,
    revision: 0,
  }
  await saveProjectLocal(project.id, project.name, project.nodes, project.edges, project.patches)
  return project
}

export async function deleteProjectWithSync(projectId: string): Promise<void> {
  const scope = getStorageScope()
  const localProject = await loadProjectLocal(projectId)
  if (projectId.startsWith('local_') || !isCloudStorageScope()) {
    const deletedNodes = await deleteProjectSnapshot(projectId, scope)
    await clearProjectSyncOperation(projectId, scope)
    publishProjectDeleted(projectId, scope)
    if (!deletedNodes) return
    await dropProjectSyncBase(projectId, scope)
    await deleteUnreferencedLocalFiles(deletedNodes, scope)
    return
  }

  await enqueueProjectDelete(
    projectId,
    localProject?.revision ?? 0,
    scope,
  )
  publishProjectDeleted(projectId, scope)
  if (isNetworkOnline()) {
    try {
      await flushProjectSaveWithSync(projectId, scope)
      return
    } catch (error) {
      if (!isRetryableRemoteDeferral(error)) {
        await cancelQueuedProjectDelete(projectId, scope)
        publishCatalogChanged(scope)
        throw error
      }
    }
  }
  const deletedNodes = await deleteProjectSnapshot(projectId, scope)
  await dropProjectSyncBase(projectId, scope)
  publishCatalogChanged(scope)
  if (deletedNodes) await deleteUnreferencedLocalFiles(deletedNodes, scope)
}

function createLocalId(prefix: 'local'): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`
}