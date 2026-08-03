import { deleteProject, updateProject } from '@/api/projects.api'
import { ApiError } from '@/api/client'
import type { Edge, Patches, ProjectNode } from '@/types'
import { saveProject as saveProjectLocal } from './db'
import type { ProjectSyncOperation } from './dbCore'
import { isNetworkOnline } from './syncState'
import { withoutRuntimeNodeState } from '@/state/transientProjectState'
import {
  getStorageScope,
  isGuestStorageScope,
  scopedStorageKey,
} from './storageScope'
import type { Report } from '@/report/types'
import {
  acknowledgeProjectSave,
  clearProjectSyncOperation,
  deleteProjectSnapshot,
  finalizeProjectDelete,
  getProjectSyncOperation,
  listProjectSyncOperations,
  saveProjectAndEnqueue,
} from './projectSyncQueue'
import { preserveConflictCopy } from './projectConflictCopy'
import {
  combineMergeNotices,
  MAX_SAVE_ATTEMPTS,
  recoverQueuedSave,
  type MergeNotice,
} from './projectSaveConflict'
import { captureProjectSyncBase, dropProjectSyncBase } from './projectSyncBase'
import {
  notifyProjectMerge,
  reportProjectSyncError,
} from './syncNotifications'
import { deleteUnreferencedLocalFiles } from './fileGarbageCollection'
import { loadReportsForProject } from './reportStorage'
import { flushHistoryFileCleanup } from './historyFileCleanup'
import { publishProjectDeleted } from './projectCatalog'

export {
  reportProjectSyncError,
  setProjectSyncErrorHandler,
} from './syncNotifications'

const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const flushes = new Map<string, Promise<void>>()

/**
 * The queued payload holds the reports as they stood when it was enqueued, but report
 * edits are persisted on their own schedule and can outrun it. Sending the older copy
 * makes the server authoritative for reports it has never seen, and the next load then
 * deletes them locally, so the durable copy goes out instead.
 */
async function withDurableReports(
  projectId: string,
  scope: string,
  queued: ProjectSyncOperation,
): Promise<ProjectSyncOperation> {
  const payload = queued.payload
  if (!payload) return queued
  const durable = await loadReportsForProject(projectId, scope)
  if (!Object.keys(durable).length) return queued
  return { ...queued, payload: { ...payload, reports: { ...payload.reports, ...durable } } }
}

async function flushQueuedSave(
  projectId: string,
  scope: string,
  queued: ProjectSyncOperation,
): Promise<void> {
  let pending = await withDurableReports(projectId, scope, queued)
  let merge: MergeNotice | null = null
  for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt += 1) {
    const payload = pending.payload
    if (!payload) throw new Error('Queued project save has no payload')
    try {
      const updated = await updateProject(projectId, {
        ...payload,
        expectedRevision: pending.expectedRevision,
      })
      await acknowledgeProjectSave(
        projectId,
        pending.generation,
        updated.revision,
        updated.updatedAt,
        scope,
      )
      await captureProjectSyncBase(projectId, updated.revision, payload, scope)
      await flushHistoryFileCleanup(payload.nodes, scope)
      if (merge) notifyProjectMerge({ projectId, ...merge })
      return
    } catch (error) {
      const recovery = attempt < MAX_SAVE_ATTEMPTS
        ? await recoverQueuedSave(projectId, scope, pending, error)
        : null
      if (!recovery) {
        if (error instanceof ApiError && error.statusCode === 409) {
          await preserveConflictCopy(projectId, payload, scope)
        } else if (error instanceof ApiError && error.statusCode === 404) {
          // Deleted elsewhere: keep queued edits as a conflict copy, then drop the
          // phantom original so it cannot linger in the local project list.
          await preserveConflictCopy(projectId, payload, scope)
          await deleteProjectSnapshot(projectId, scope)
          await dropProjectSyncBase(projectId, scope)
          publishProjectDeleted(projectId, scope)
          reportProjectSyncError(
            'This project was deleted elsewhere. Your unsynced work was preserved as a conflict copy.',
          )
        }
        throw error
      }
      pending = recovery.operation
      if (recovery.merge) merge = combineMergeNotices(merge, recovery.merge)
    }
  }
}

async function flushQueuedDelete(
  projectId: string,
  scope: string,
  pending: ProjectSyncOperation,
): Promise<void> {
  try {
    await deleteProject(projectId, pending.expectedRevision)
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) throw error
  }
  const deletedNodes = await finalizeProjectDelete(
    projectId,
    pending.generation,
    scope,
  )
  if (!deletedNodes) return
  publishProjectDeleted(projectId, scope)
  await dropProjectSyncBase(projectId, scope)
  await deleteUnreferencedLocalFiles(deletedNodes, scope)
}

async function flushQueuedOperation(
  projectId: string,
  scope: string,
): Promise<void> {
  while (true) {
    const pending = await getProjectSyncOperation(projectId, scope)
    if (!pending) return
    if (pending.operation === 'save') {
      await flushQueuedSave(projectId, scope, pending)
    } else {
      await flushQueuedDelete(projectId, scope, pending)
    }
    reportProjectSyncError(null)
  }
}

export async function flushProjectSaveWithSync(
  projectId: string,
  scope = getStorageScope(),
): Promise<void> {
  const key = scopedStorageKey(scope, projectId)
  const timeout = saveTimeouts.get(key)
  if (timeout) clearTimeout(timeout)
  saveTimeouts.delete(key)
  if (
    !isNetworkOnline()
    || isGuestStorageScope(scope)
    || scope !== getStorageScope()
    || projectId.startsWith('local_')
  ) return

  const existing = flushes.get(key)
  if (existing) return existing
  const flush = flushQueuedOperation(projectId, scope)
  flushes.set(key, flush)
  try {
    await flush
  } finally {
    if (flushes.get(key) === flush) flushes.delete(key)
  }
}

export async function saveProjectWithSync(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
  reports: Record<string, Report> = {},
): Promise<void> {
  const scope = getStorageScope()
  const persistedNodes = withoutRuntimeNodeState(nodes)
  if (isGuestStorageScope(scope) || projectId.startsWith('local_')) {
    await saveProjectLocal(projectId, name, persistedNodes, edges, patches, undefined, scope)
    await flushHistoryFileCleanup(persistedNodes, scope)
    return
  }
  await saveProjectAndEnqueue(
    projectId,
    name,
    persistedNodes,
    edges,
    patches,
    reports,
    scope,
  )
  const key = scopedStorageKey(scope, projectId)
  const existingTimeout = saveTimeouts.get(key)
  if (existingTimeout) clearTimeout(existingTimeout)
  const timeout = setTimeout(() => {
    void flushProjectSaveWithSync(projectId, scope).catch((error) => {
      console.error('[Sync] Failed to save to backend:', error)
      reportProjectSyncError(
        error instanceof Error ? error.message : 'Project sync failed',
      )
    })
  }, 2000)
  saveTimeouts.set(key, timeout)
}

export interface ProjectSyncConflict {
  projectId: string
  operation: 'save' | 'delete'
}

export async function flushAllQueuedProjectSavesWithSync(
  scope = getStorageScope(),
): Promise<ProjectSyncConflict[]> {
  const operations = await listProjectSyncOperations(scope)
  const conflicts: ProjectSyncConflict[] = []
  for (const operation of operations) {
    try {
      await flushProjectSaveWithSync(operation.projectId, scope)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        conflicts.push({
          projectId: operation.projectId,
          operation: operation.operation,
        })
        continue
      }
      // Drop doomed queue entries (e.g. invalid project ids) so one bad sync
      // cannot brick app startup for an otherwise healthy account.
      if (error instanceof ApiError && error.statusCode === 400) {
        await clearProjectSyncOperation(operation.projectId, scope)
        reportProjectSyncError(
          error.errors?.join(', ') || error.message || 'Project sync failed',
        )
        continue
      }
      throw error
    }
  }
  return conflicts
}
