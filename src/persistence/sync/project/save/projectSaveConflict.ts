import { getProject } from '@/api/projects.api'
import { ApiError } from '@/api/client'
import type { ProjectSyncOperation } from '../../../storage/local-db/dbCore'
import { mergeProjectSnapshots } from '../../../merge/projectMerge'
import { getProjectSyncBase, remoteProjectSnapshot } from './projectSyncBase'
import {
  getProjectSyncOperation,
  replaceQueuedProjectSave,
} from './projectSyncQueue'
import type { ProjectMergeEvent } from '../../session/syncNotifications'
import {
  isStorageScopeContextCurrent,
  type StorageScopeContext,
} from '../../../storage/storageScope'

export const MAX_SAVE_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 5_000

export type MergeNotice = Omit<ProjectMergeEvent, 'projectId'>

export interface QueuedSaveRetry {
  operation: ProjectSyncOperation
  merge: MergeNotice | null
}

/** Honours `Retry-After`, but never stalls a save behind an implausible delay. */
export function retryAfterDelayMs(error: ApiError): number {
  const advertised = error.retryAfterSeconds
  if (advertised === undefined || !Number.isFinite(advertised)) {
    return DEFAULT_RETRY_DELAY_MS
  }
  return Math.min(Math.max(advertised, 0) * 1000, MAX_RETRY_DELAY_MS)
}

export function combineMergeNotices(
  previous: MergeNotice | null,
  next: MergeNotice,
): MergeNotice {
  if (!previous) return next
  return {
    recoveredReportIds: [
      ...new Set([...previous.recoveredReportIds, ...next.recoveredReportIds]),
    ],
    droppedEdgeIds: [...new Set([...previous.droppedEdgeIds, ...next.droppedEdgeIds])],
  }
}

/** Null hands the failure back to the caller, which falls back to the conflict copy. */
export async function recoverQueuedSave(
  projectId: string,
  scope: string,
  pending: ProjectSyncOperation,
  error: unknown,
  context: StorageScopeContext,
): Promise<QueuedSaveRetry | null> {
  if (!(error instanceof ApiError) || !pending.payload) return null
  if (error.statusCode === 429) {
    await delay(retryAfterDelayMs(error))
    if (!isStorageScopeContextCurrent(context)) return null
    const current = await getProjectSyncOperation(projectId, scope)
    if (!isStorageScopeContextCurrent(context)) return null
    if (current && current.operation !== 'save') return null
    return {
      operation: current ?? pending,
      merge: null,
    }
  }
  if (error.statusCode !== 409) return null
  try {
    return await mergeQueuedSave(projectId, scope, pending, context)
  } catch (mergeError) {
    console.error('[Sync] Automatic merge failed:', mergeError)
    return null
  }
}

async function mergeQueuedSave(
  projectId: string,
  scope: string,
  pending: ProjectSyncOperation,
  context: StorageScopeContext,
): Promise<QueuedSaveRetry | null> {
  if (!pending.payload) return null
  const base = await getProjectSyncBase(projectId, scope)
  if (!isStorageScopeContextCurrent(context)) return null
  if (!base || base.revision !== pending.expectedRevision) return null
  const server = await getProject(projectId)
  if (!isStorageScopeContextCurrent(context)) return null
  const outcome = mergeProjectSnapshots({
    base: base.snapshot,
    local: pending.payload,
    server: remoteProjectSnapshot(server),
  })
  if (outcome.status !== 'merged') return null

  const operation = await replaceQueuedProjectSave(
    projectId,
    pending.generation,
    outcome.snapshot,
    server.revision ?? 0,
    scope,
    context,
  )
  if (!operation) return null
  return {
    operation,
    merge: {
      recoveredReportIds: outcome.recoveredReportIds,
      droppedEdgeIds: outcome.droppedEdgeIds,
    },
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
