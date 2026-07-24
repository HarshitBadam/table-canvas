import { deleteProject, updateProject } from '@/api/projects.api'
import { ApiError } from '@/api/client'
import type { Edge, Patches, ProjectNode } from '@/types'
import { saveProject as saveProjectLocal } from './db'
import { isNetworkOnline } from './syncState'
import { withoutTransientComputeState } from '@/state/transientProjectState'
import {
  getStorageScope,
  GUEST_STORAGE_SCOPE,
  scopedStorageKey,
} from './storageScope'
import type { Report } from '@/report/types'
import {
  acknowledgeProjectSave,
  finalizeProjectDelete,
  getProjectSyncOperation,
  listProjectSyncOperations,
  saveProjectAndEnqueue,
} from './projectSyncQueue'
import { deleteUnreferencedLocalFiles } from './fileGarbageCollection'

const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const flushes = new Map<string, Promise<void>>()

let projectSyncErrorHandler: ((message: string | null) => void) | null = null

export function setProjectSyncErrorHandler(
  handler: ((message: string | null) => void) | null,
): void {
  projectSyncErrorHandler = handler
}

export function reportProjectSyncError(message: string): void {
  projectSyncErrorHandler?.(message)
}

async function flushQueuedOperation(
  projectId: string,
  scope: string,
): Promise<void> {
  while (true) {
    const pending = await getProjectSyncOperation(projectId, scope)
    if (!pending) return
    if (pending.operation === 'save') {
      if (!pending.payload) throw new Error('Queued project save has no payload')
      const updated = await updateProject(projectId, {
        ...pending.payload,
        expectedRevision: pending.expectedRevision,
      })
      await acknowledgeProjectSave(
        projectId,
        pending.generation,
        updated.revision,
        updated.updatedAt,
        scope,
      )
    } else {
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
      if (deletedNodes) await deleteUnreferencedLocalFiles(deletedNodes, scope)
    }
    projectSyncErrorHandler?.(null)
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
    || scope === GUEST_STORAGE_SCOPE
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
  const persistedNodes = withoutTransientComputeState(nodes)
  if (scope === GUEST_STORAGE_SCOPE || projectId.startsWith('local_')) {
    await saveProjectLocal(projectId, name, persistedNodes, edges, patches, undefined, scope)
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
      projectSyncErrorHandler?.(
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
      if (!(error instanceof ApiError) || error.statusCode !== 409) throw error
      conflicts.push({
        projectId: operation.projectId,
        operation: operation.operation,
      })
    }
  }
  return conflicts
}
