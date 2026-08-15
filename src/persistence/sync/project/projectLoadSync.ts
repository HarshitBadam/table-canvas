import { getProject } from '@/api/projects.api'
import { ApiError } from '@/api/client'
import {
  loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
  type ProjectSyncOperation,
  type StoredProject,
} from '../../storage/local-db/db'
import { deserializePatches } from '../../storage/local-db/patchSerialization'
import { replaceReportsForProject } from '../../storage/local-db/reportStorage'
import { isNetworkOnline } from '../session/syncState'
import { isRetryableRemoteDeferral } from './projectCreateReconciliation'
import { fromRemote, type ProjectWithSync } from './projectSyncHelpers'
import { flushProjectSaveWithSync, reportProjectSyncError } from './save/projectSaveSync'
import { cancelQueuedProjectDelete, getProjectSyncOperation } from './save/projectSyncQueue'
import { captureProjectSyncBase, remoteProjectSnapshot } from './save/projectSyncBase'
import { publishCatalogChanged } from './projectCatalog'
import {
  captureStorageScopeContext,
  isGuestStorageScope,
  isStorageScopeContextCurrent,
  type StorageScopeContext,
} from '../../storage/storageScope'

type RemoteProject = Parameters<typeof fromRemote>[0]

function toProjectWithSync(
  local: StoredProject,
  overrides: Pick<ProjectWithSync, 'isLocalOnly' | 'needsSync'>,
  revisionFallback = 0,
): ProjectWithSync {
  return {
    ...local,
    patches: deserializePatches(local.patches),
    revision: local.revision ?? revisionFallback,
    ...overrides,
  }
}

/**
 * A queued delete can be outrun by a newer cloud write. `'continue'` means the
 * delete was cancelled and the caller must fall through to a normal load of the
 * now-current cloud copy; `'deleted'` means there is nothing further to load.
 */
async function resolvePendingDelete(
  projectId: string,
  scope: string,
  pending: ProjectSyncOperation,
  context: StorageScopeContext,
): Promise<'deleted' | 'continue'> {
  if (!isNetworkOnline() || isGuestStorageScope(scope)) return 'deleted'
  try {
    await flushProjectSaveWithSync(projectId, scope, context)
    return 'deleted'
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 409) {
      await cancelQueuedProjectDelete(projectId, scope, pending.generation, context)
      publishCatalogChanged(scope)
      reportProjectSyncError(
        'This project changed in the cloud and was not deleted. The newer version was kept.',
      )
      return 'continue'
    }
    if (isRetryableRemoteDeferral(error)) return 'deleted'
    throw error
  }
}

type QueuedSaveReconciliation =
  | { outcome: 'resolved'; project: ProjectWithSync }
  | { outcome: 'use-remote'; remoteProject: RemoteProject }

/**
 * A queued save must be flushed before trusting a freshly fetched remote copy,
 * otherwise the load would silently discard unsynced local work. A `null` result
 * means the storage scope changed mid-flight and the caller must abandon the load.
 */
async function reconcileQueuedSaveBeforeLoad(
  projectId: string,
  scope: string,
  localProject: StoredProject,
  remoteProject: RemoteProject,
  context: StorageScopeContext,
): Promise<QueuedSaveReconciliation | null> {
  try {
    await flushProjectSaveWithSync(projectId, scope, context)
    if (!isStorageScopeContextCurrent(context)) return null
    const synced = await loadProjectLocal(projectId, scope)
    if (synced) {
      return {
        outcome: 'resolved',
        project: toProjectWithSync(
          synced,
          { isLocalOnly: false, needsSync: false },
          remoteProject.revision ?? 0,
        ),
      }
    }
    return { outcome: 'use-remote', remoteProject }
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 409) {
      // The flush already merged or preserved the queued work; take the cloud copy.
      const refetched = await getProject(projectId)
      if (!isStorageScopeContextCurrent(context)) return null
      return { outcome: 'use-remote', remoteProject: refetched }
    }
    if (isRetryableRemoteDeferral(error)) {
      return {
        outcome: 'resolved',
        project: toProjectWithSync(localProject, { isLocalOnly: false, needsSync: true }),
      }
    }
    throw error
  }
}

async function cacheRemoteProjectLocally(
  remoteProject: RemoteProject,
  scope: string,
  context: StorageScopeContext,
): Promise<ProjectWithSync | null> {
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
    scope,
  )
  if (!isStorageScopeContextCurrent(context)) return null
  await replaceReportsForProject(loaded.id, remoteProject.reports ?? {}, scope)
  if (!isStorageScopeContextCurrent(context)) return null
  await captureProjectSyncBase(
    loaded.id,
    remoteProject.revision ?? 0,
    remoteProjectSnapshot(remoteProject),
    scope,
    context,
  )
  if (!isStorageScopeContextCurrent(context)) return null
  return loaded
}

export async function loadProjectWithSync(projectId: string): Promise<ProjectWithSync | null> {
  const context = captureStorageScopeContext()
  const scope = context.scope
  const localProject = await loadProjectLocal(projectId, scope)
  const pending = await getProjectSyncOperation(projectId, scope)
  if (!isStorageScopeContextCurrent(context)) return null
  if (pending?.operation === 'delete') {
    const outcome = await resolvePendingDelete(projectId, scope, pending, context)
    if (outcome === 'deleted') return null
  }
  if (projectId.startsWith('local_')) {
    if (!localProject) return null
    return toProjectWithSync(localProject, { isLocalOnly: true, needsSync: true })
  }

  if (isNetworkOnline() && !isGuestStorageScope(scope)) {
    try {
      let remoteProject = await getProject(projectId)
      if (!isStorageScopeContextCurrent(context)) return null
      if (pending?.operation === 'save' && localProject) {
        const reconciled = await reconcileQueuedSaveBeforeLoad(
          projectId,
          scope,
          localProject,
          remoteProject,
          context,
        )
        if (!reconciled) return null
        if (reconciled.outcome === 'resolved') return reconciled.project
        remoteProject = reconciled.remoteProject
      }
      return await cacheRemoteProjectLocally(remoteProject, scope, context)
    } catch (error) {
      console.error('[syncService] Failed to load project from backend:', error)
      if (!isStorageScopeContextCurrent(context)) return null
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
  return toProjectWithSync(localProject, {
    isLocalOnly: !isNetworkOnline() || isGuestStorageScope(scope),
    needsSync: pending?.operation === 'save',
  })
}
