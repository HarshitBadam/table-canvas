import { deleteProject, updateProject } from '@/api/projects.api'
import { ApiError } from '@/api/client'
import type { Edge, Patches, ProjectNode } from '@/types'
import { saveProject as saveProjectLocal } from '../../../storage/local-db/db'
import type { ProjectSyncOperation } from '../../../storage/local-db/dbCore'
import { isNetworkOnline } from '../../session/syncState'
import { withoutRuntimeNodeState } from '@/state/document/transientProjectState'
import {
  captureStorageScopeContext,
  getStorageScope,
  isGuestStorageScope,
  isStorageScopeContextCurrent,
  scopedStorageKey,
  type StorageScopeContext,
} from '../../../storage/storageScope'
import type { Report } from '@/report/types'
import {
  acknowledgeProjectSave,
  clearProjectSyncOperation,
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
} from '../../session/syncNotifications'
import { deleteUnreferencedLocalFiles } from '../../files/fileGarbageCollection'
import { loadReportsForProject } from '../../../storage/local-db/reportStorage'
import { flushHistoryFileCleanup } from '../../files/historyFileCleanup'
import { publishProjectDeleted } from '../projectCatalog'

export {
  reportProjectSyncError,
  setProjectSyncErrorHandler,
} from '../../session/syncNotifications'

const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const flushes = new Map<string, Promise<void>>()
const fallbackFlushTails = new Map<string, Promise<void>>()
const PROJECT_FLUSH_LOCK_PREFIX = 'table-canvas:project-sync:'

/**
 * Keyed by the scoped project (not the whole account) so unrelated projects never
 * wait on each other; same-project flushes still serialize through this same key.
 */
async function withFallbackProjectFlushLock(
  key: string,
  flush: () => Promise<void>,
): Promise<void> {
  const previous = fallbackFlushTails.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(flush)
  fallbackFlushTails.set(key, current)
  try {
    await current
  } finally {
    if (fallbackFlushTails.get(key) === current) {
      fallbackFlushTails.delete(key)
    }
  }
}

async function withProjectFlushLock(
  key: string,
  flush: () => Promise<void>,
): Promise<void> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return withFallbackProjectFlushLock(key, flush)

  let started = false
  try {
    await locks.request(
      `${PROJECT_FLUSH_LOCK_PREFIX}${key}`,
      { mode: 'exclusive' },
      async () => {
        started = true
        await flush()
      },
    )
  } catch (error) {
    if (started) throw error
    console.warn('[Sync] Web Lock unavailable; using tab-local flush serialization:', error)
    await withFallbackProjectFlushLock(key, flush)
  }
}

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
  context: StorageScopeContext,
): Promise<boolean> {
  let pending = await withDurableReports(projectId, scope, queued)
  let merge: MergeNotice | null = null
  for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt += 1) {
    if (!isStorageScopeContextCurrent(context)) return false
    const payload = pending.payload
    if (!payload) throw new Error('Queued project save has no payload')
    try {
      const updated = await updateProject(projectId, {
        ...payload,
        expectedRevision: pending.expectedRevision,
      })
      // The server already committed this revision. Acknowledge it in its
      // original scope unconditionally so a later login never re-sends an
      // already-accepted operation, even if the auth epoch changed while the
      // request was in flight. The remaining bookkeeping below is safe to skip
      // once the scope context has moved on.
      await acknowledgeProjectSave(
        projectId,
        pending.generation,
        updated.revision,
        updated.updatedAt,
        scope,
        context,
      )
      if (!isStorageScopeContextCurrent(context)) return false
      await captureProjectSyncBase(projectId, updated.revision, payload, scope, context)
      if (!isStorageScopeContextCurrent(context)) return false
      await flushHistoryFileCleanup(payload.nodes, scope, context)
      if (!isStorageScopeContextCurrent(context)) return false
      if (merge) notifyProjectMerge({ projectId, ...merge })
      return true
    } catch (error) {
      if (!isStorageScopeContextCurrent(context)) return false
      const recovery = attempt < MAX_SAVE_ATTEMPTS
        ? await recoverQueuedSave(projectId, scope, pending, error, context)
        : null
      if (!isStorageScopeContextCurrent(context)) return false
      if (!recovery) {
        const current = await getProjectSyncOperation(projectId, scope)
        if (
          current?.operation === 'save'
          && current.generation !== pending.generation
        ) {
          pending = await withDurableReports(projectId, scope, current)
          continue
        }
        if (error instanceof ApiError && error.statusCode === 409) {
          const preserved = await preserveConflictCopy(
            projectId,
            payload,
            pending.generation,
            scope,
            context,
          )
          if (!preserved) return true
        } else if (error instanceof ApiError && error.statusCode === 404) {
          const preserved = await preserveConflictCopy(
            projectId,
            payload,
            pending.generation,
            scope,
            context,
            true,
          )
          if (!preserved) return true
          await dropProjectSyncBase(projectId, scope)
          publishProjectDeleted(projectId, scope)
          reportProjectSyncError(
            'This project was deleted elsewhere. Your unsynced work was preserved as a conflict copy.',
          )
        }
        throw error
      }
      pending = await withDurableReports(projectId, scope, recovery.operation)
      if (recovery.merge) merge = combineMergeNotices(merge, recovery.merge)
    }
  }
  return true
}

async function flushQueuedDelete(
  projectId: string,
  scope: string,
  pending: ProjectSyncOperation,
  context: StorageScopeContext,
): Promise<boolean> {
  try {
    await deleteProject(projectId, pending.expectedRevision)
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) throw error
  }
  if (!isStorageScopeContextCurrent(context)) return false
  const deletedNodes = await finalizeProjectDelete(
    projectId,
    pending.generation,
    scope,
    context,
  )
  if (!isStorageScopeContextCurrent(context)) return false
  if (!deletedNodes) return true
  publishProjectDeleted(projectId, scope)
  await dropProjectSyncBase(projectId, scope)
  await deleteUnreferencedLocalFiles(deletedNodes, scope, context)
  return true
}

async function flushQueuedOperation(
  projectId: string,
  scope: string,
  context: StorageScopeContext,
): Promise<void> {
  while (true) {
    if (!isStorageScopeContextCurrent(context)) return
    const pending = await getProjectSyncOperation(projectId, scope)
    if (!pending) return
    const completed = pending.operation === 'save'
      ? await flushQueuedSave(projectId, scope, pending, context)
      : await flushQueuedDelete(projectId, scope, pending, context)
    if (!completed) return
    reportProjectSyncError(null)
  }
}

export async function flushProjectSaveWithSync(
  projectId: string,
  scope = getStorageScope(),
  context = captureStorageScopeContext(),
): Promise<void> {
  const key = scopedStorageKey(scope, projectId)
  const timeout = saveTimeouts.get(key)
  if (timeout) clearTimeout(timeout)
  saveTimeouts.delete(key)
  if (
    !isNetworkOnline()
    || isGuestStorageScope(scope)
    || scope !== context.scope
    || !isStorageScopeContextCurrent(context)
    || projectId.startsWith('local_')
  ) return

  const existing = flushes.get(key)
  if (existing) return existing
  const flush = withProjectFlushLock(
    key,
    () => flushQueuedOperation(projectId, scope, context),
  )
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
  const context = captureStorageScopeContext()
  const scope = context.scope
  const persistedNodes = withoutRuntimeNodeState(nodes)
  if (isGuestStorageScope(scope) || projectId.startsWith('local_')) {
    await saveProjectLocal(projectId, name, persistedNodes, edges, patches, undefined, scope)
    if (!isStorageScopeContextCurrent(context)) return
    await flushHistoryFileCleanup(persistedNodes, scope, context)
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
    void flushProjectSaveWithSync(projectId, scope, context).catch((error) => {
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
  generation: number
}

export async function flushAllQueuedProjectSavesWithSync(
  scope = getStorageScope(),
): Promise<ProjectSyncConflict[]> {
  const context = captureStorageScopeContext()
  if (context.scope !== scope) return []
  const operations = await listProjectSyncOperations(scope)
  const conflicts: ProjectSyncConflict[] = []
  for (const operation of operations) {
    try {
      await flushProjectSaveWithSync(operation.projectId, scope, context)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        conflicts.push({
          projectId: operation.projectId,
          operation: operation.operation,
          generation: operation.generation,
        })
        continue
      }
      // Drop doomed queue entries (e.g. invalid project ids) so one bad sync
      // cannot brick app startup for an otherwise healthy account.
      if (error instanceof ApiError && error.statusCode === 400) {
        if (!isStorageScopeContextCurrent(context)) return conflicts
        await clearProjectSyncOperation(
          operation.projectId,
          scope,
          operation.generation,
          context,
        )
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
